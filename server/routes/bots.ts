// Dashboard API: create/edit/publish bots and read their orders.
// Every route requires login and only touches the caller's own bots.
import { Router } from "express";
import multer from "multer";
import { isTestConversation, pickContent, rid, TEST_VISITOR_PREFIX, type Bot, type BotPatch, type ChatMessage, type Order, type Plan, type QA, type User } from "../../shared/types.js";
import { findTemplate } from "../../shared/templates.js";
import { formatLimit, limitsFor, nextPlanWhere, PLAN_NAMES, publishBlockers, type PlanLimits } from "../../shared/plans.js";
import { deleteOwnedBot, findOwnedBot, insertBot, listOwnedBots, mutateOwnedBot } from "../store.js";
import { fetchSiteTitle, fetchVerificationToken, normalizeUrl } from "../site.js";
import { db } from "../db/index.js";
import { handle, HttpError } from "../http.js";
import { currentUser, requireUser } from "../auth/middleware.js";
import { rateLimit } from "../rateLimit.js";
import { checkImage, sameOriginOnly } from "../security.js";

// Files are held in memory and handed to the database layer (disk or Supabase Storage).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

const HEX = /^#[0-9a-f]{6}$/i;

/** 403 with a message that names the plan and, when one exists, the cheapest plan that lifts the limit. */
function planError(plan: Plan, what: string, ok: (l: PlanLimits) => boolean): HttpError {
  const next = nextPlanWhere(plan, ok);
  const hint = next ? ` Upgrade to ${PLAN_NAMES[next]} to unlock this.` : "";
  return new HttpError(403, `${what}${hint}`);
}

/** Rejects a draft edit that would exceed the plan. */
function checkPatch(user: User, patch: BotPatch) {
  const l = limitsFor(user.plan);
  if (patch.qa && l.questionsPerSite !== null && patch.qa.length > l.questionsPerSite) {
    throw planError(user.plan, `Your ${PLAN_NAMES[user.plan]} plan includes up to ${l.questionsPerSite} questions per site.`, (x) => x.questionsPerSite === null || x.questionsPerSite > l.questionsPerSite!);
  }
  if (patch.enableOrders && !l.orders) {
    throw planError(user.plan, `Order collection isn't included in the ${PLAN_NAMES[user.plan]} plan.`, (x) => x.orders);
  }
  if ((patch.logoUrl || patch.backgroundImageUrl) && !l.branding) {
    throw planError(user.plan, `Logo and background images aren't included in the ${PLAN_NAMES[user.plan]} plan.`, (x) => x.branding);
  }
}

// Hard ceilings on what one bot can store, independent of plan (plans are checked separately).
const MAX = { name: 120, message: 1000, question: 500, answer: 4000, qaItems: 2000, imageUrl: 500 };
// Image fields may only point at our own uploads or an https URL (e.g. Supabase Storage):
// no javascript:, data:, or characters that could break out of a CSS url() in the widget.
const IMAGE_URL = /^(\/uploads\/[\w.-]+|https:\/\/[^\s"'()<>\\]+)$/;
const QA_ID = /^[\w-]{1,40}$/;

/** Keeps only known, well-typed, size-bounded fields from a PATCH body. */
function sanitizePatch(body: any): BotPatch {
  const out: BotPatch = {};
  if (typeof body.name === "string") out.name = body.name.substring(0, MAX.name);
  if (typeof body.welcomeMessage === "string") out.welcomeMessage = body.welcomeMessage.substring(0, MAX.message);
  if (typeof body.fallbackMessage === "string") out.fallbackMessage = body.fallbackMessage.substring(0, MAX.message);
  if (typeof body.themeColor === "string" && HEX.test(body.themeColor)) out.themeColor = body.themeColor;
  if (typeof body.enableOrders === "boolean") out.enableOrders = body.enableOrders;
  for (const key of ["logoUrl", "backgroundImageUrl"] as const) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null || v === "") out[key] = null;
    else if (typeof v === "string" && v.length <= MAX.imageUrl && IMAGE_URL.test(v)) out[key] = v;
    else throw new HttpError(400, "That image address isn't allowed. Upload the image instead.");
  }
  if (Array.isArray(body.qa)) {
    if (body.qa.length > MAX.qaItems) throw new HttpError(400, `A site can have at most ${MAX.qaItems} questions.`);
    out.qa = body.qa
      .filter((q: any) => q && typeof q === "object")
      .map((q: any): QA => ({
        id: typeof q.id === "string" && QA_ID.test(q.id) ? q.id : rid(6),
        question: String(q.question ?? "").substring(0, MAX.question),
        answer: String(q.answer ?? "").substring(0, MAX.answer),
      }));
  }
  return out;
}

function csvCell(s: string) {
  return `"${String(s).replace(/"/g, '""')}"`;
}

export const botRoutes = Router();

// Cookie-authenticated: block cross-site writes (CSRF), cap request volume per IP, then require login.
botRoutes.use(sameOriginOnly);
botRoutes.use(rateLimit({ windowMs: 60 * 1000, max: 300, message: "Too many requests. Please slow down for a moment." }));
botRoutes.use(requireUser);

// Adding a site and verifying it both fetch the customer's website, so they get a tighter limit.
const siteFetchLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: "Too many website checks. Please wait a few minutes." });

botRoutes.get(
  "/",
  handle(async (_req, res) => {
    res.json(await listOwnedBots(currentUser(res).id));
  })
);

botRoutes.post(
  "/",
  siteFetchLimiter,
  handle(async (req, res) => {
    const { url: rawUrl, templateId } = req.body as { url?: string; templateId?: string };
    const url = normalizeUrl(rawUrl ?? "");
    if (!url) throw new HttpError(400, "Enter a valid website address, like https://example.com");

    const user = currentUser(res);
    const limits = limitsFor(user.plan);
    const owned = await listOwnedBots(user.id);
    if (limits.sites !== null && owned.length >= limits.sites) {
      throw planError(user.plan, `Your ${PLAN_NAMES[user.plan]} plan includes ${limits.sites} website${limits.sites === 1 ? "" : "s"}.`, (x) => x.sites === null || x.sites > limits.sites!);
    }

    const name = await fetchSiteTitle(url);
    const template = findTemplate(templateId) || findTemplate("blank")!;
    const bot: Bot = {
      id: rid(8),
      ownerId: user.id,
      name,
      url,
      welcomeMessage: template.welcomeMessage,
      fallbackMessage: template.fallbackMessage,
      themeColor: template.themeColor,
      // Templates are trimmed to what the plan allows, so a new site never starts over its limits.
      qa: template.qa.slice(0, limits.questionsPerSite ?? undefined).map((q) => ({ id: rid(6), question: q.question, answer: q.answer })),
      logoUrl: null,
      backgroundImageUrl: null,
      enableOrders: template.enableOrders && limits.orders,
      orderCount: 0,
      unansweredCount: 0,
      unreadCount: 0,
      needsHumanCount: 0,
      templateId: template.id,
      published: null,
      lastPublished: null,
      lastUpdated: new Date().toISOString(),
      verified: false,
      verificationToken: `sb_${rid(9)}`,
    };
    await insertBot(bot);
    res.json(bot);
  })
);

botRoutes.patch(
  "/:id",
  handle(async (req, res) => {
    const patch = sanitizePatch(req.body ?? {});
    checkPatch(currentUser(res), patch);
    const bot = await mutateOwnedBot(currentUser(res).id, req.params.id, (bot) => {
      Object.assign(bot, patch);
      bot.lastUpdated = new Date().toISOString();
      return bot;
    });
    res.json(bot);
  })
);

botRoutes.delete(
  "/:id",
  handle(async (req, res) => {
    await deleteOwnedBot(currentUser(res).id, req.params.id);
    res.json({ success: true });
  })
);

botRoutes.post(
  "/:id/upload",
  upload.single("file"),
  handle(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Please choose an image file (PNG, JPG, GIF or WebP) under 5 MB.");
    // Decide the file type from its bytes; the browser-sent name and type are ignored.
    const image = checkImage(req.file.buffer);
    const { fieldName } = req.body;
    const user = currentUser(res);
    const limits = limitsFor(user.plan);
    if (fieldName !== "logoUrl" && fieldName !== "backgroundImageUrl") throw new HttpError(400, "Invalid field");
    if (!limits.branding) throw planError(user.plan, `Logo and background images aren't included in the ${PLAN_NAMES[user.plan]} plan.`, (x) => x.branding);
    if (req.file.size > limits.uploadMB * 1024 * 1024) throw new HttpError(400, `Images on the ${PLAN_NAMES[user.plan]} plan must be under ${formatLimit(limits.uploadMB)} MB.`);
    // Make sure the bot exists and is ours before storing anything, so a rejected request leaves no orphan file.
    await findOwnedBot(user.id, req.params.id);
    const fileUrl = await db().uploads.save({ buffer: req.file.buffer, ...image });
    await mutateOwnedBot(user.id, req.params.id, (bot) => {
      bot[fieldName as "logoUrl" | "backgroundImageUrl"] = fileUrl;
      bot.lastUpdated = new Date().toISOString();
    });
    res.json({ [fieldName]: fileUrl });
  })
);

botRoutes.post(
  "/:id/verify",
  siteFetchLimiter,
  handle(async (req, res) => {
    const ownerId = currentUser(res).id;
    const bot = await findOwnedBot(ownerId, req.params.id);
    let token: string | undefined;
    try {
      token = await fetchVerificationToken(bot.url);
    } catch {
      throw new HttpError(502, "Could not reach your website. Make sure the URL is public.");
    }
    if (token !== bot.verificationToken) {
      throw new HttpError(
        400,
        token
          ? "Found a verification tag but the token doesn't match. Make sure you copied the latest one."
          : "We couldn't find the verification meta tag in your site's <head>. Add it and try again."
      );
    }
    const updated = await mutateOwnedBot(ownerId, bot.id, (b) => {
      b.verified = true;
      return b;
    });
    res.json({ success: true, bot: updated });
  })
);

botRoutes.post(
  "/:id/publish",
  handle(async (req, res) => {
    const user = currentUser(res);
    const bot = await mutateOwnedBot(user.id, req.params.id, (bot) => {
      if (!bot.verified) throw new HttpError(403, "Verify your domain before publishing.");
      // A site can drift over its limits when the account's plan changes; say exactly what to fix.
      const blockers = publishBlockers(user.plan, bot);
      if (blockers.length) throw new HttpError(403, blockers.join(" "));
      const now = new Date().toISOString();
      bot.published = { ...pickContent(bot), publishedAt: now };
      bot.lastPublished = now;
      return bot;
    });
    res.json(bot);
  })
);

botRoutes.post(
  "/:id/discard",
  handle(async (req, res) => {
    const bot = await mutateOwnedBot(currentUser(res).id, req.params.id, (bot) => {
      if (!bot.published) throw new HttpError(400, "Nothing to discard — never published.");
      Object.assign(bot, pickContent(bot.published));
      bot.lastUpdated = new Date().toISOString();
      return bot;
    });
    res.json(bot);
  })
);

// Paged: ?limit=50&offset=0 → { orders, total }, newest first.
botRoutes.get(
  "/:id/orders",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json(await db().orders.list(bot.id, { limit, offset }));
  })
);

botRoutes.get(
  "/:id/unanswered",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    res.json(await db().unanswered.list(bot.id));
  })
);

botRoutes.delete(
  "/:id/unanswered",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    await db().unanswered.clear(bot.id);
    res.json({ success: true });
  })
);

botRoutes.delete(
  "/:id/unanswered/:uid",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    await db().unanswered.delete(bot.id, req.params.uid);
    res.json({ success: true });
  })
);

// ---- Inbox ----

botRoutes.get(
  "/:id/conversations",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json(await db().conversations.list(bot.id, { limit, offset }));
  })
);

// Opening a conversation marks it read.
botRoutes.get(
  "/:id/conversations/:cid",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    const conversation = await db().conversations.get(req.params.cid);
    if (!conversation || conversation.botId !== bot.id) throw new HttpError(404, "Conversation not found");
    const messages = await db().conversations.messages(conversation.id);
    if (conversation.unread) await db().conversations.markRead(conversation.id);
    res.json({ conversation: { ...conversation, unread: false }, messages });
  })
);

botRoutes.post(
  "/:id/conversations/:cid/reply",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    const conversation = await db().conversations.get(req.params.cid);
    if (!conversation || conversation.botId !== bot.id) throw new HttpError(404, "Conversation not found");
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 2000) : "";
    if (!text) throw new HttpError(400, "Write a reply first.");
    const m: ChatMessage = { id: rid(8), conversationId: conversation.id, role: "owner", text, createdAt: new Date().toISOString() };
    await db().conversations.appendMessage(m);
    res.json(m);
  })
);

botRoutes.delete(
  "/:id/conversations/:cid",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    const conversation = await db().conversations.get(req.params.cid);
    if (!conversation || conversation.botId !== bot.id) throw new HttpError(404, "Conversation not found");
    await db().conversations.delete(conversation.id);
    res.json({ success: true });
  })
);

// ---- Test chats (owner's preview → Inbox) ----
// Works for drafts too: owners test before publishing. Same shape as the widget's sync call.

const TEST_ID = /^[A-Za-z0-9_-]{6,40}$/;

botRoutes.post(
  "/:id/test-messages",
  handle(async (req, res) => {
    const user = currentUser(res);
    const bot = await findOwnedBot(user.id, req.params.id);
    const { conversationId, pageUrl, messages } = req.body ?? {};
    if (typeof conversationId !== "string" || !TEST_ID.test(conversationId)) throw new HttpError(400, "Invalid conversation id");
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 10) throw new HttpError(400, "Invalid messages");
    const existing = await db().conversations.get(conversationId);
    if (existing) {
      if (existing.botId !== bot.id || !isTestConversation(existing)) throw new HttpError(403, "Not a test conversation of this site");
    } else {
      await db().conversations.ensure(
        { id: conversationId, botId: bot.id, visitorId: TEST_VISITOR_PREFIX + rid(8), pageUrl: String(pageUrl ?? "").slice(0, 300), now: new Date().toISOString() },
        limitsFor(user.plan).conversationsKept,
      );
    }
    const base = Date.now();
    let i = 0;
    for (const raw of messages) {
      const role = raw?.role === "bot" ? "bot" : "visitor";
      const text = typeof raw?.text === "string" ? raw.text.trim().slice(0, 2000) : "";
      if (!text) continue;
      await db().conversations.appendMessage({ id: rid(10), conversationId, role, text, createdAt: new Date(base + i++).toISOString(), ...(role === "visitor" && raw?.toTeam === true ? { toTeam: true } : {}) });
    }
    res.json({ conversationId });
  })
);

// The preview polls this for owner replies (doesn't mark the conversation read).
botRoutes.get(
  "/:id/test-messages/:cid",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    const conv = await db().conversations.get(req.params.cid);
    if (!conv || conv.botId !== bot.id || !isTestConversation(conv)) throw new HttpError(404, "Not found");
    const after = typeof req.query.after === "string" && !Number.isNaN(Date.parse(req.query.after)) ? new Date(req.query.after).toISOString() : undefined;
    const messages = await db().conversations.messages(conv.id, { after, roles: ["owner"] });
    res.setHeader("Cache-Control", "no-store");
    res.json({ messages: messages.map((m) => ({ id: m.id, text: m.text, createdAt: m.createdAt })) });
  })
);

botRoutes.delete(
  "/:id/test-conversations",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    res.json({ deleted: await db().conversations.deleteTest(bot.id) });
  })
);

botRoutes.get(
  "/:id/orders/export/csv",
  handle(async (req, res) => {
    const bot = await findOwnedBot(currentUser(res).id, req.params.id);
    // Stream in pages so a large history doesn't need to fit in memory at once.
    const all: Order[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await db().orders.list(bot.id, { limit: 500, offset });
      all.push(...page.orders);
      if (all.length >= page.total || page.orders.length === 0) break;
    }
    let csv = "ID,Name,Email,Phone,Message,Timestamp\n";
    for (const o of all) {
      csv += [o.id, o.name, o.email, o.phone, o.message, o.timestamp].map(csvCell).join(",") + "\n";
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="orders-${bot.id}-${Date.now()}.csv"`);
    // BOM so Excel opens non-ASCII names (e.g. Arabic) correctly.
    res.send("﻿" + csv);
  })
);

// The Syncave API, as one Hono app. In production it runs as the Supabase Edge
// Function "api" (server/edge.ts); tests run it in Node against local JSON files.
//
// Paths keep the /api prefix: the function is named "api", so a request to
//   https://<project>.supabase.co/functions/v1/api/bots
// arrives here as /api/bots.
//
// Two kinds of routes:
//   - Dashboard routes: need `Authorization: Bearer <Supabase access token>` and only
//     touch the caller's own bots.
//   - Widget routes: public, called from customers' websites; rate-limited and bounded.
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { isTestConversation, pickContent, rid, TEST_VISITOR_PREFIX, type Bot, type BotPatch, type ChatMessage, type Order, type Plan, type QA, type User } from "../shared/types.js";
import { findTemplate } from "../shared/templates.js";
import { formatLimit, limitsFor, nextPlanWhere, PAID_PLANS_AVAILABLE, PLAN_NAMES, publishBlockers, type PlanLimits } from "../shared/plans.js";
import { questionKey, scriptOf } from "../shared/normalize.js";
import { db } from "./db/index.js";
import { deleteOwnedBot, findBot, findOwnedBot, insertBot, listOwnedBots, mutateOwnedBot, NotFound } from "./store.js";
import { buildSitePreview, fetchSiteTitle, normalizeUrl } from "./site.js";
import { installStatus, verifyOwnership } from "./verify.js";
import { BlockedAddress } from "./safeFetch.js";
import { HttpError } from "./errors.js";
import { checkImage } from "./security.js";
import { rateLimit } from "./rateLimit.js";
import { requireUser, type AuthVars, type VerifyToken } from "./auth.js";
import { errFields, log } from "./log.js";

type Env = { Variables: AuthVars & { requestId: string } };

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const MSG_MAX_LEN = 2000;
/** Distinct unanswered questions kept per site; the rarest/oldest are dropped past this. */
const UNANSWERED_PER_SITE = 200;
const UNANSWERED_MAX_LEN = 300;
// Hard ceilings on what one bot can store, independent of plan (plans are checked separately).
const MAX = { name: 120, message: 1000, question: 500, answer: 4000, qaItems: 2000, imageUrl: 500 };
// Image fields may only point at an https URL (Supabase Storage): no javascript:, data:,
// or characters that could break out of a CSS url() in the widget.
const IMAGE_URL = /^(\/uploads\/[\w.-]+|https:\/\/[^\s"'()<>\\]+)$/;
const QA_ID = /^[\w-]{1,40}$/;
const MAX_UPLOAD = 5 * 1024 * 1024;

/** 403 with a message that names the plan and, when one exists, the cheapest plan that lifts the limit. */
function planError(plan: Plan, what: string, ok: (l: PlanLimits) => boolean): HttpError {
  const next = nextPlanWhere(plan, ok);
  const hint = !next ? "" : PAID_PLANS_AVAILABLE ? ` Upgrade to ${PLAN_NAMES[next]} to unlock this.` : ` It's part of the ${PLAN_NAMES[next]} plan, coming soon.`;
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

const csvCell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

/** JSON body or 400 (never a 500 for a malformed request). */
async function body(c: Context): Promise<any> {
  try {
    return (await c.req.json()) ?? {};
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}

function publicBot(bot: Bot) {
  if (!bot.published) return null;
  const live = bot.published;
  return {
    id: bot.id,
    name: bot.name,
    welcomeMessage: live.welcomeMessage,
    fallbackMessage: live.fallbackMessage,
    themeColor: live.themeColor,
    logoUrl: live.logoUrl,
    backgroundImageUrl: live.backgroundImageUrl,
    enableOrders: live.enableOrders,
    qa: live.qa.map((q) => ({ id: q.id, question: q.question, answer: q.answer })),
  };
}

/**
 * Anonymized copy for the dialect layer: question text, script and industry only.
 * Deliberately no bot id, owner, IP, or timestamp finer than the day.
 */
function appendGlobalLog(question: string, templateId: string | undefined) {
  db().unansweredLog
    .append({ day: new Date().toISOString().slice(0, 10), lang: scriptOf(question), industry: templateId ?? "unknown", question })
    .catch((e) => log.warn("unanswered_global", errFields(e)));
}

export function createApp({ verifyToken }: { verifyToken: VerifyToken }) {
  const app = new Hono<Env>();

  // ---- Cross-cutting ----

  // Request id for log correlation (kept from the proxy when present).
  app.use("*", async (c, next) => {
    const incoming = c.req.header("x-request-id") ?? c.req.header("sb-request-id");
    const id = incoming && /^[\w.-]{6,80}$/.test(incoming) ? incoming : rid(16);
    c.set("requestId", id);
    const start = Date.now();
    await next();
    c.header("X-Request-Id", id);
    const ms = Date.now() - start;
    if (c.res.status >= 500) log.error("request failed", { requestId: id, method: c.req.method, path: c.req.path, status: c.res.status, ms });
    else if (ms > 2000) log.warn("slow request", { requestId: id, method: c.req.method, path: c.req.path, status: c.res.status, ms });
  });

  // Everything is token-based (no cookies), so any origin may call: the dashboard on
  // Firebase Hosting and the widget on customers' sites alike.
  app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
    exposeHeaders: ["X-Request-Id", "Retry-After", "Content-Disposition"],
    maxAge: 86400,
  }));
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  // JSON bodies up to 2 MB (a large Q&A); the upload route has its own limit.
  app.use("/api/*", async (c, next) => {
    if (c.req.path.endsWith("/upload")) return next();
    return bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (cc) => cc.json({ error: "Request is too large." }, 413) })(c, next);
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any);
    if (err instanceof NotFound) return c.json({ error: err.message }, 404);
    log.error("unhandled api error", { requestId: c.get("requestId"), method: c.req.method, path: c.req.path, ...errFields(err) });
    return c.json({ error: "Something went wrong." }, 500);
  });

  // ---- Health ----

  app.get("/api/health", async (c) => {
    c.header("Cache-Control", "no-store");
    try {
      await Promise.race([
        db().users.count(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("database check timed out")), 3000)),
      ]);
      return c.json({ ok: true, db: db().kind });
    } catch (err) {
      log.error("health check failed", errFields(err));
      return c.json({ ok: false, reason: "database unavailable" }, 503);
    }
  });

  // ---- Widget (public) ----

  // The published bot config. Short public cache: a publish shows up within a minute.
  app.get("/api/bot/:id/public", async (c) => {
    const bot = await findBot(c.req.param("id"));
    if (!bot) throw new HttpError(404, "Bot not found");
    const data = publicBot(bot);
    if (!data) throw new HttpError(404, "Bot is not published yet.");
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(data);
  });

  // The widget syncs a conversation: creates it on first use, then appends visitor/bot messages in small batches.
  app.post("/api/bots/:id/conversations", rateLimit({ windowMs: 10 * 60 * 1000, max: 240, message: "Too many requests." }), async (c) => {
    const { conversationId, visitorId, pageUrl, messages } = await body(c);
    if (!isId(conversationId) || !isId(visitorId) || visitorId.toLowerCase().startsWith(TEST_VISITOR_PREFIX)) throw new HttpError(400, "Invalid ids");
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 10) throw new HttpError(400, "Invalid messages");
    const bot = await findBot(c.req.param("id"));
    if (!bot?.published) throw new HttpError(404, "Bot is not published yet.");
    const owner = bot.ownerId ? await db().users.findById(bot.ownerId) : undefined;
    const limits = limitsFor(owner?.plan);
    const existing = await db().conversations.get(conversationId);
    if (existing) {
      if (existing.botId !== bot.id || existing.visitorId !== visitorId) throw new HttpError(403, "Not your conversation");
    } else {
      await db().conversations.ensure({ id: conversationId, botId: bot.id, visitorId, pageUrl: String(pageUrl ?? "").slice(0, 300), now: new Date().toISOString() }, limits.conversationsKept);
    }
    // Server time, never the visitor's clock: keeps threads ordered and retention honest. Batch order is preserved.
    const base = Date.now();
    let i = 0;
    for (const raw of messages) {
      const role = raw?.role === "bot" ? "bot" : "visitor";
      const text = typeof raw?.text === "string" ? raw.text.trim().slice(0, MSG_MAX_LEN) : "";
      if (!text) continue;
      // Client ids make retries idempotent; scoping them to the conversation keeps visitors from colliding.
      const m: ChatMessage = {
        id: isId(raw?.id) ? `${conversationId}_${raw.id}` : rid(10),
        conversationId, role, text, createdAt: new Date(base + i++).toISOString(),
        ...(role === "visitor" && raw?.toTeam === true ? { toTeam: true } : {}),
      };
      await db().conversations.appendMessage(m);
    }
    return c.json({ success: true });
  });

  // The widget polls for replies from the site owner. Only owner messages, only for the visitor who owns the conversation.
  app.get("/api/bots/:id/conversations/:cid/messages", rateLimit({ windowMs: 60 * 1000, max: 60, message: "Too many requests." }), async (c) => {
    const visitorId = c.req.query("visitor") ?? "";
    const afterQ = c.req.query("after");
    const after = afterQ && !Number.isNaN(Date.parse(afterQ)) ? new Date(afterQ).toISOString() : undefined;
    const cid = c.req.param("cid");
    if (!isId(cid) || !isId(visitorId)) throw new HttpError(400, "Invalid ids");
    const conv = await db().conversations.get(cid);
    if (!conv || conv.botId !== c.req.param("id") || conv.visitorId !== visitorId) throw new HttpError(404, "Not found");
    const messages = await db().conversations.messages(conv.id, { after, roles: ["owner"] });
    c.header("Cache-Control", "no-store");
    return c.json({ messages: messages.map((m) => ({ id: m.id, text: m.text, createdAt: m.createdAt })) });
  });

  // The widget reports a typed question that hit the fallback.
  app.post("/api/bots/:id/unanswered", rateLimit({ windowMs: 10 * 60 * 1000, max: 60, message: "Too many requests." }), async (c) => {
    const b = await body(c);
    const raw = typeof b?.question === "string" ? b.question.trim().replace(/\s+/g, " ") : "";
    const key = questionKey(raw);
    if (!raw || raw.length > UNANSWERED_MAX_LEN || key.length < 2) throw new HttpError(400, "Invalid question");
    const bot = await findBot(c.req.param("id"));
    if (!bot?.published) throw new HttpError(404, "Bot is not published yet.");
    await db().unanswered.record(bot.id, { id: rid(8), question: raw, key, now: new Date().toISOString() }, UNANSWERED_PER_SITE);
    appendGlobalLog(raw, bot.templateId);
    return c.json({ success: true });
  });

  app.post("/api/bots/:id/orders", rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: "Too many orders from this address. Please try again later." }), async (c) => {
    const { name, email, phone, message } = await body(c);
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    if (!str(name) || !str(email)) throw new HttpError(400, "Name and email required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(email)) || str(email).length > 254) throw new HttpError(400, "Please enter a valid email address.");
    if (phone != null && typeof phone !== "string") throw new HttpError(400, "Invalid phone number");
    if (message != null && typeof message !== "string") throw new HttpError(400, "Invalid message");
    const bot = await findBot(c.req.param("id"));
    if (!bot) throw new HttpError(404, "Bot not found");
    // Storage follows the owner's plan: whether orders are collected at all, and how many are kept.
    const owner = bot.ownerId ? await db().users.findById(bot.ownerId) : undefined;
    const limits = limitsFor(owner?.plan);
    // Orders follow the live (published) setting — that's what visitors see.
    if (!bot.published?.enableOrders || !limits.orders) throw new HttpError(403, "Orders not enabled for this bot");
    const order: Order = {
      id: rid(8),
      name: str(name).substring(0, 100),
      email: str(email).substring(0, 254),
      phone: str(phone).substring(0, 20),
      message: str(message).substring(0, 500),
      timestamp: new Date().toISOString(),
    };
    await db().orders.insert(bot.id, order, limits.ordersKept);
    return c.json({ success: true, order });
  });

  // ---- Simulator (public) ----
  // Fetches a page and returns its HTML; the simulator shows it in a sandboxed
  // iframe (srcdoc, no same-origin), so the page's scripts can't touch Syncave.
  app.post("/api/simulate", rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: "Too many previews. Please wait a few minutes." }), async (c) => {
    const url = normalizeUrl(String((await body(c))?.url ?? ""));
    if (!url) throw new HttpError(400, "Enter a valid website address, like example.com");
    try {
      const preview = await buildSitePreview(url);
      c.header("Cache-Control", "no-store");
      return c.json({ url: preview.finalUrl, title: preview.title, lang: preview.lang, html: preview.html });
    } catch (e) {
      if (e instanceof BlockedAddress) throw new HttpError(400, "That address can't be previewed.");
      throw new HttpError(422, "We couldn't load that website. Check the address, or try again in a moment.");
    }
  });

  // ---- Dashboard (signed in) ----

  const signedIn = requireUser(verifyToken);
  const dashLimit = rateLimit({ windowMs: 60 * 1000, max: 300, message: "Too many requests. Please slow down for a moment." });
  // Adding a site and verifying it both fetch the customer's website, so they get a tighter limit.
  const siteFetchLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: "Too many website checks. Please wait a few minutes." });
  const me = (c: Context<Env>) => c.get("user");

  app.get("/api/me", dashLimit, signedIn, (c) => c.json({ user: me(c) }));

  app.get("/api/bots", dashLimit, signedIn, async (c) => c.json(await listOwnedBots(me(c).id)));

  app.post("/api/bots", dashLimit, siteFetchLimit, signedIn, async (c) => {
    const { url: rawUrl, templateId } = await body(c);
    const url = normalizeUrl(typeof rawUrl === "string" ? rawUrl : "");
    if (!url) throw new HttpError(400, "Enter a valid website address, like https://example.com");
    const user = me(c);
    const limits = limitsFor(user.plan);
    const owned = await listOwnedBots(user.id);
    if (limits.sites !== null && owned.length >= limits.sites) {
      throw planError(user.plan, `Your ${PLAN_NAMES[user.plan]} plan includes ${limits.sites} website${limits.sites === 1 ? "" : "s"}.`, (x) => x.sites === null || x.sites > limits.sites!);
    }
    const name = await fetchSiteTitle(url);
    const template = findTemplate(typeof templateId === "string" ? templateId : undefined) || findTemplate("blank")!;
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
    return c.json(bot);
  });

  app.patch("/api/bots/:id", dashLimit, signedIn, async (c) => {
    const patch = sanitizePatch(await body(c));
    checkPatch(me(c), patch);
    const bot = await mutateOwnedBot(me(c).id, c.req.param("id"), (bot) => {
      Object.assign(bot, patch);
      bot.lastUpdated = new Date().toISOString();
      return bot;
    });
    return c.json(bot);
  });

  app.delete("/api/bots/:id", dashLimit, signedIn, async (c) => {
    await deleteOwnedBot(me(c).id, c.req.param("id"));
    return c.json({ success: true });
  });

  app.post("/api/bots/:id/upload", dashLimit, signedIn,
    bodyLimit({ maxSize: MAX_UPLOAD + 64 * 1024, onError: (cc) => cc.json({ error: "That file is larger than 5 MB." }, 413) }),
    async (c) => {
      const form = await c.req.parseBody();
      const file = form["file"];
      const fieldName = form["fieldName"];
      if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Please choose an image file (PNG, JPG, GIF or WebP) under 5 MB.");
      if (fieldName !== "logoUrl" && fieldName !== "backgroundImageUrl") throw new HttpError(400, "Invalid field");
      const user = me(c);
      const limits = limitsFor(user.plan);
      if (!limits.branding) throw planError(user.plan, `Logo and background images aren't included in the ${PLAN_NAMES[user.plan]} plan.`, (x) => x.branding);
      if (file.size > Math.min(MAX_UPLOAD, limits.uploadMB * 1024 * 1024)) throw new HttpError(400, `Images on the ${PLAN_NAMES[user.plan]} plan must be under ${formatLimit(limits.uploadMB)} MB.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Decide the file type from its bytes; the browser-sent name and type are ignored.
      const image = checkImage(bytes);
      // Make sure the bot exists and is ours before storing anything, so a rejected request leaves no orphan file.
      await findOwnedBot(user.id, c.req.param("id"));
      const fileUrl = await db().uploads.save({ buffer: bytes, ...image });
      await mutateOwnedBot(user.id, c.req.param("id"), (bot) => {
        bot[fieldName] = fileUrl;
        bot.lastUpdated = new Date().toISOString();
      });
      return c.json({ [fieldName]: fileUrl });
    });

  app.post("/api/bots/:id/verify", dashLimit, siteFetchLimit, signedIn, async (c) => {
    const ownerId = me(c).id;
    const bot = await findOwnedBot(ownerId, c.req.param("id"));
    // Meta tag, this bot's chat script, or a DNS TXT record: any one proves ownership.
    const method = await verifyOwnership(bot);
    const updated = await mutateOwnedBot(ownerId, bot.id, (b) => { b.verified = true; return b; });
    return c.json({ success: true, method, bot: updated });
  });

  // Is the chat snippet on the site's homepage, and does it point at the right address?
  app.get("/api/bots/:id/install-status", dashLimit, siteFetchLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    c.header("Cache-Control", "no-store");
    return c.json(await installStatus(bot));
  });

  app.post("/api/bots/:id/publish", dashLimit, signedIn, async (c) => {
    const user = me(c);
    const bot = await mutateOwnedBot(user.id, c.req.param("id"), (bot) => {
      if (!bot.verified) throw new HttpError(403, "Verify your domain before publishing.");
      // A site can drift over its limits when the account's plan changes; say exactly what to fix.
      const blockers = publishBlockers(user.plan, bot);
      if (blockers.length) throw new HttpError(403, blockers.join(" "));
      const now = new Date().toISOString();
      bot.published = { ...pickContent(bot), publishedAt: now };
      bot.lastPublished = now;
      return bot;
    });
    return c.json(bot);
  });

  app.post("/api/bots/:id/discard", dashLimit, signedIn, async (c) => {
    const bot = await mutateOwnedBot(me(c).id, c.req.param("id"), (bot) => {
      if (!bot.published) throw new HttpError(400, "Nothing to discard — never published.");
      Object.assign(bot, pickContent(bot.published));
      bot.lastUpdated = new Date().toISOString();
      return bot;
    });
    return c.json(bot);
  });

  // Paged: ?limit=50&offset=0 → { orders, total }, newest first.
  app.get("/api/bots/:id/orders", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    return c.json(await db().orders.list(bot.id, { limit, offset }));
  });

  app.get("/api/bots/:id/orders/export/csv", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    const all: Order[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await db().orders.list(bot.id, { limit: 500, offset });
      all.push(...page.orders);
      if (all.length >= page.total || page.orders.length === 0) break;
    }
    let csv = "ID,Name,Email,Phone,Message,Timestamp\n";
    for (const o of all) csv += [o.id, o.name, o.email, o.phone, o.message, o.timestamp].map(csvCell).join(",") + "\n";
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="orders-${bot.id}-${Date.now()}.csv"`);
    // BOM so Excel opens non-ASCII names (e.g. Arabic) correctly.
    return c.body("﻿" + csv);
  });

  app.get("/api/bots/:id/unanswered", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    return c.json(await db().unanswered.list(bot.id));
  });

  app.delete("/api/bots/:id/unanswered", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    await db().unanswered.clear(bot.id);
    return c.json({ success: true });
  });

  app.delete("/api/bots/:id/unanswered/:uid", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    await db().unanswered.delete(bot.id, c.req.param("uid"));
    return c.json({ success: true });
  });

  // ---- Inbox ----

  app.get("/api/bots/:id/conversations", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 30, 1), 100);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    return c.json(await db().conversations.list(bot.id, { limit, offset }));
  });

  // Opening a conversation marks it read.
  app.get("/api/bots/:id/conversations/:cid", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    const conversation = await db().conversations.get(c.req.param("cid"));
    if (!conversation || conversation.botId !== bot.id) throw new HttpError(404, "Conversation not found");
    const messages = await db().conversations.messages(conversation.id);
    if (conversation.unread) await db().conversations.markRead(conversation.id);
    return c.json({ conversation: { ...conversation, unread: false }, messages });
  });

  app.post("/api/bots/:id/conversations/:cid/reply", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    const conversation = await db().conversations.get(c.req.param("cid"));
    if (!conversation || conversation.botId !== bot.id) throw new HttpError(404, "Conversation not found");
    const b = await body(c);
    const text = typeof b?.text === "string" ? b.text.trim().slice(0, MSG_MAX_LEN) : "";
    if (!text) throw new HttpError(400, "Write a reply first.");
    const m: ChatMessage = { id: rid(8), conversationId: conversation.id, role: "owner", text, createdAt: new Date().toISOString() };
    await db().conversations.appendMessage(m);
    return c.json(m);
  });

  app.delete("/api/bots/:id/conversations/:cid", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    const conversation = await db().conversations.get(c.req.param("cid"));
    if (!conversation || conversation.botId !== bot.id) throw new HttpError(404, "Conversation not found");
    await db().conversations.delete(conversation.id);
    return c.json({ success: true });
  });

  // ---- Test chats (owner's preview → Inbox). Works for drafts too. ----

  app.post("/api/bots/:id/test-messages", dashLimit, signedIn, async (c) => {
    const user = me(c);
    const bot = await findOwnedBot(user.id, c.req.param("id"));
    const { conversationId, pageUrl, messages } = await body(c);
    if (!isId(conversationId)) throw new HttpError(400, "Invalid conversation id");
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
      const text = typeof raw?.text === "string" ? raw.text.trim().slice(0, MSG_MAX_LEN) : "";
      if (!text) continue;
      await db().conversations.appendMessage({
        id: rid(10), conversationId, role, text, createdAt: new Date(base + i++).toISOString(),
        ...(role === "visitor" && raw?.toTeam === true ? { toTeam: true } : {}),
      });
    }
    return c.json({ conversationId });
  });

  // The preview polls this for owner replies (doesn't mark the conversation read).
  app.get("/api/bots/:id/test-messages/:cid", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    const conv = await db().conversations.get(c.req.param("cid"));
    if (!conv || conv.botId !== bot.id || !isTestConversation(conv)) throw new HttpError(404, "Not found");
    const afterQ = c.req.query("after");
    const after = afterQ && !Number.isNaN(Date.parse(afterQ)) ? new Date(afterQ).toISOString() : undefined;
    const messages = await db().conversations.messages(conv.id, { after, roles: ["owner"] });
    c.header("Cache-Control", "no-store");
    return c.json({ messages: messages.map((m) => ({ id: m.id, text: m.text, createdAt: m.createdAt })) });
  });

  app.delete("/api/bots/:id/test-conversations", dashLimit, signedIn, async (c) => {
    const bot = await findOwnedBot(me(c).id, c.req.param("id"));
    return c.json({ deleted: await db().conversations.deleteTest(bot.id) });
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}

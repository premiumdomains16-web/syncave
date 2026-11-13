// Endpoints used by the embedded widget on customers' websites.
// These are the high-traffic paths, so each one is a small number of single-row
// reads plus one atomic write — no read-modify-write of the bot.
import { Router } from "express";
import fs from "fs/promises";
import { rid, TEST_VISITOR_PREFIX, type Bot, type ChatMessage, type Order } from "../../shared/types.js";
import { questionKey, scriptOf } from "../../shared/normalize.js";
import { rateLimit } from "../rateLimit.js";
import { db } from "../db/index.js";
import { findBot } from "../store.js";
import { findUserById } from "../auth/accounts.js";
import { limitsFor } from "../../shared/plans.js";
import { WIDGET_FILE } from "../paths.js";
import { handle, HttpError, openCors } from "../http.js";

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

export const publicRoutes = Router();

/** Distinct unanswered questions kept per site; the rarest/oldest are dropped past this. */
const UNANSWERED_PER_SITE = 200;
const UNANSWERED_MAX_LEN = 300;

/**
 * Anonymized copy for the dialect layer: question text, script and industry only.
 * Deliberately no bot id, owner, IP, or timestamp finer than the day.
 */
function appendGlobalLog(question: string, templateId: string | undefined) {
  db().unansweredLog
    .append({ day: new Date().toISOString().slice(0, 10), lang: scriptOf(question), industry: templateId ?? "unknown", question })
    .catch((e) => console.warn("unanswered_global:", (e as Error).message));
}

publicRoutes.get("/widget.js", openCors, async (_req, res) => {
  try {
    const js = await fs.readFile(WIDGET_FILE, "utf-8");
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(js);
  } catch {
    res.status(500).send("// widget unavailable");
  }
});

// The published bot config. Short public cache: a publish shows up within a minute,
// and a busy site's repeat visitors don't hit the database on every page view.
publicRoutes.get(
  "/api/bot/:id/public",
  openCors,
  handle(async (req, res) => {
    const bot = await findBot(req.params.id);
    if (!bot) throw new HttpError(404, "Bot not found");
    const data = publicBot(bot);
    if (!data) throw new HttpError(404, "Bot is not published yet.");
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(data);
  })
);

publicRoutes.options("/api/bots/:id/orders", openCors);
publicRoutes.options("/api/bots/:id/unanswered", openCors);
publicRoutes.options("/api/bots/:id/conversations", openCors);
publicRoutes.options("/api/bots/:id/conversations/:cid/messages", openCors);

const ID = /^[A-Za-z0-9_-]{6,40}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const MSG_MAX_LEN = 2000;

// The widget syncs a conversation: creates it on first use, then appends visitor/bot messages in small batches.
publicRoutes.post(
  "/api/bots/:id/conversations",
  openCors,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 240, message: "Too many requests." }),
  handle(async (req, res) => {
    const { conversationId, visitorId, pageUrl, messages } = req.body ?? {};
    if (!isId(conversationId) || !isId(visitorId) || visitorId.toLowerCase().startsWith(TEST_VISITOR_PREFIX)) throw new HttpError(400, "Invalid ids");
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 10) throw new HttpError(400, "Invalid messages");
    const bot = await findBot(req.params.id);
    if (!bot?.published) throw new HttpError(404, "Bot is not published yet.");
    const owner = bot.ownerId ? await findUserById(bot.ownerId) : undefined;
    const limits = limitsFor(owner?.plan);
    const now = new Date().toISOString();
    const existing = await db().conversations.get(conversationId);
    if (existing) {
      if (existing.botId !== bot.id || existing.visitorId !== visitorId) throw new HttpError(403, "Not your conversation");
    } else {
      await db().conversations.ensure({ id: conversationId, botId: bot.id, visitorId, pageUrl: String(pageUrl ?? "").slice(0, 300), now }, limits.conversationsKept);
    }
    // Timestamps are assigned here, never taken from the visitor's clock (which may be skewed):
    // server time keeps threads ordered and the per-plan retention honest. Batch order is preserved.
    const base = Date.now();
    let i = 0;
    for (const raw of messages) {
      const role = raw?.role === "bot" ? "bot" : "visitor";
      const text = typeof raw?.text === "string" ? raw.text.trim().slice(0, MSG_MAX_LEN) : "";
      if (!text) continue;
      // Client ids make retries idempotent; scoping them to the conversation keeps visitors from colliding with each other.
      const m: ChatMessage = { id: isId(raw?.id) ? `${conversationId}_${raw.id}` : rid(10), conversationId, role, text, createdAt: new Date(base + i++).toISOString(), ...(role === "visitor" && raw?.toTeam === true ? { toTeam: true } : {}) };
      await db().conversations.appendMessage(m);
    }
    res.json({ success: true });
  })
);

// The widget polls for replies from the site owner. Only owner messages, only for the visitor who owns the conversation.
publicRoutes.get(
  "/api/bots/:id/conversations/:cid/messages",
  openCors,
  rateLimit({ windowMs: 60 * 1000, max: 60, message: "Too many requests." }),
  handle(async (req, res) => {
    const visitorId = String(req.query.visitor ?? "");
    const after = typeof req.query.after === "string" && !Number.isNaN(Date.parse(req.query.after)) ? new Date(req.query.after).toISOString() : undefined;
    if (!isId(req.params.cid) || !isId(visitorId)) throw new HttpError(400, "Invalid ids");
    const conv = await db().conversations.get(req.params.cid);
    if (!conv || conv.botId !== req.params.id || conv.visitorId !== visitorId) throw new HttpError(404, "Not found");
    const messages = await db().conversations.messages(conv.id, { after, roles: ["owner"] });
    res.setHeader("Cache-Control", "no-store");
    res.json({ messages: messages.map((m) => ({ id: m.id, text: m.text, createdAt: m.createdAt })) });
  })
);

// The widget reports a typed question that hit the fallback. Public, so rate-limited and bounded.
publicRoutes.post(
  "/api/bots/:id/unanswered",
  openCors,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 60, message: "Too many requests." }),
  handle(async (req, res) => {
    const raw = typeof req.body?.question === "string" ? req.body.question.trim().replace(/\s+/g, " ") : "";
    const key = questionKey(raw);
    if (!raw || raw.length > UNANSWERED_MAX_LEN || key.length < 2) throw new HttpError(400, "Invalid question");
    const bot = await findBot(req.params.id);
    if (!bot?.published) throw new HttpError(404, "Bot is not published yet.");
    await db().unanswered.record(bot.id, { id: rid(8), question: raw, key, now: new Date().toISOString() }, UNANSWERED_PER_SITE);
    appendGlobalLog(raw, bot.templateId);
    res.json({ success: true });
  })
);

publicRoutes.post(
  "/api/bots/:id/orders",
  openCors,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: "Too many orders from this address. Please try again later." }),
  handle(async (req, res) => {
    const { name, email, phone, message } = req.body ?? {};
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    if (!str(name) || !str(email)) throw new HttpError(400, "Name and email required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(email)) || str(email).length > 254) throw new HttpError(400, "Please enter a valid email address.");
    if (phone != null && typeof phone !== "string") throw new HttpError(400, "Invalid phone number");
    if (message != null && typeof message !== "string") throw new HttpError(400, "Invalid message");
    const bot = await findBot(req.params.id);
    if (!bot) throw new HttpError(404, "Bot not found");
    // Storage follows the owner's plan: whether orders are collected at all, and how many are kept.
    const owner = bot.ownerId ? await findUserById(bot.ownerId) : undefined;
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
    res.json({ success: true, order });
  })
);

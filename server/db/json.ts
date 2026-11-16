// JSON-file implementation of the Database interface, used by the automated API
// tests (scripts/test-api.ts) so they never touch the real Supabase project.
// Node-only (uses the file system); never bundled into the Edge Function.
import fs from "fs/promises";
import path from "path";
import { isTestConversation, rid, type Bot, type ChatMessage, type Conversation, type Order, type Unanswered } from "../../shared/types.js";
import { createJsonStore } from "../jsonStore.js";
import { DATA_DIR, UPLOADS_DIR } from "../paths.js";
import type { Database, UserRecord } from "./types.js";
import type { PaymentRequest } from "../../shared/billing.js";

/** A bot row as stored on disk: the Bot minus its derived counters. */
type BotRow = Omit<Bot, "orderCount" | "unansweredCount" | "unreadCount" | "needsHumanCount"> & { orders?: unknown; unanswered?: unknown };
type OrderRow = Order & { botId: string };
type UnansweredRow = Unanswered & { botId: string };

/** Fills defaults for rows written by older versions of the app. */
export function normalizeBot(b: any): BotRow {
  return {
    id: b.id,
    ownerId: b.ownerId ?? null,
    name: b.name,
    url: b.url,
    welcomeMessage: b.welcomeMessage ?? "Hi! How can I help?",
    fallbackMessage: b.fallbackMessage ?? "I don't have an answer for that yet. Try one of the suggested questions below.",
    themeColor: b.themeColor ?? "#1f33d6",
    qa: Array.isArray(b.qa) ? b.qa : [],
    logoUrl: b.logoUrl ?? null,
    backgroundImageUrl: b.backgroundImageUrl ?? null,
    enableOrders: !!b.enableOrders,
    ...(typeof b.templateId === "string" ? { templateId: b.templateId } : {}),
    published: b.published ? { logoUrl: null, backgroundImageUrl: null, enableOrders: false, ...b.published } : null,
    lastPublished: b.lastPublished ?? null,
    lastUpdated: b.lastUpdated ?? b.lastTrained ?? new Date().toISOString(),
    verified: !!b.verified,
    verificationToken: b.verificationToken ?? `sb_${rid(9)}`,
    // Legacy inline arrays (moved to their own files on first access — see migrateLegacy).
    ...(Array.isArray(b.orders) && b.orders.length ? { orders: b.orders } : {}),
    ...(Array.isArray(b.unanswered) && b.unanswered.length ? { unanswered: b.unanswered } : {}),
  };
}

const stripRow = ({ orders: _o, unanswered: _u, ...rest }: BotRow) => rest;

export function createJsonDatabase(): Database {
  const bots = createJsonStore<BotRow>("bots.json", normalizeBot);
  const users = createJsonStore<UserRecord>("users.json");
  const orders = createJsonStore<OrderRow>("orders.json");
  const unanswered = createJsonStore<UnansweredRow>("unanswered.json");
  const conversations = createJsonStore<Conversation>("conversations.json", (r) => ({ ...r, needsHuman: !!r.needsHuman }));
  const messages = createJsonStore<ChatMessage>("messages.json");
  const payments = createJsonStore<PaymentRequest>("payments.json");
  const GLOBAL_LOG = path.join(DATA_DIR, "unanswered-global.jsonl");

  // One-time move of orders/unanswered that older versions kept inside bots.json.
  let legacy: Promise<void> | undefined;
  const migrateLegacy = () => (legacy ??= (async () => {
    const rows = await bots.read();
    const movedOrders: OrderRow[] = [];
    const movedUnanswered: UnansweredRow[] = [];
    for (const b of rows) {
      if (Array.isArray(b.orders)) for (const o of b.orders as Order[]) movedOrders.push({ botId: b.id, ...o });
      if (Array.isArray(b.unanswered)) for (const u of b.unanswered as Unanswered[]) movedUnanswered.push({ botId: b.id, ...u });
    }
    if (!movedOrders.length && !movedUnanswered.length) return;
    await orders.mutate((all) => { all.push(...movedOrders); });
    await unanswered.mutate((all) => { all.push(...movedUnanswered); });
    await bots.mutate((all) => { for (let i = 0; i < all.length; i++) all[i] = stripRow(all[i]); });
    console.log(`Moved ${movedOrders.length} orders and ${movedUnanswered.length} unanswered questions out of bots.json.`);
  })());

  async function withCounts(row: BotRow): Promise<Bot> {
    const [o, u, c] = await Promise.all([orders.read(), unanswered.read(), conversations.read()]);
    return {
      ...stripRow(row),
      orderCount: o.filter((x) => x.botId === row.id).length,
      unansweredCount: u.filter((x) => x.botId === row.id).length,
      unreadCount: c.filter((x) => x.botId === row.id && x.unread).length,
      needsHumanCount: c.filter((x) => x.botId === row.id && x.needsHuman).length,
    };
  }

  return {
    kind: "json",
    users: {
      findByEmail: async (email) => (await users.read()).find((u) => u.email === email),
      findById: async (id) => (await users.read()).find((u) => u.id === id),
      findByAuthId: async (authId) => (await users.read()).find((u) => u.authId === authId),
      count: async () => (await users.read()).length,
      insert: (user) => users.mutate((all) => {
        if (all.some((u) => u.email === user.email || (user.authId && u.authId === user.authId))) throw new Error("duplicate user");
        all.push(user);
      }),
      linkAuth: (userId, authId) => users.mutate((all) => { const u = all.find((x) => x.id === userId); if (u && !u.authId) u.authId = authId; }),
      setPlan: (userId, plan, expiresAt) => users.mutate((all) => { const u = all.find((x) => x.id === userId); if (u) { u.plan = plan; u.planExpiresAt = expiresAt; } }),
    },
    bots: {
      listByOwner: async (ownerId) => {
        await migrateLegacy();
        const [rows, o, u, c] = await Promise.all([bots.read(), orders.read(), unanswered.read(), conversations.read()]);
        const oc = new Map<string, number>(); for (const x of o) oc.set(x.botId, (oc.get(x.botId) ?? 0) + 1);
        const uc = new Map<string, number>(); for (const x of u) uc.set(x.botId, (uc.get(x.botId) ?? 0) + 1);
        const rc = new Map<string, number>(); for (const x of c) if (x.unread) rc.set(x.botId, (rc.get(x.botId) ?? 0) + 1);
        const hc = new Map<string, number>(); for (const x of c) if (x.needsHuman) hc.set(x.botId, (hc.get(x.botId) ?? 0) + 1);
        return rows.filter((b) => b.ownerId === ownerId).map((b) => ({ ...stripRow(b), orderCount: oc.get(b.id) ?? 0, unansweredCount: uc.get(b.id) ?? 0, unreadCount: rc.get(b.id) ?? 0, needsHumanCount: hc.get(b.id) ?? 0 }));
      },
      get: async (id) => {
        await migrateLegacy();
        const row = (await bots.read()).find((b) => b.id === id);
        return row ? withCounts(row) : undefined;
      },
      insert: (bot) => bots.mutate((all) => { all.unshift(toRow(bot)); }),
      save: (bot) => bots.mutate((all) => {
        const i = all.findIndex((b) => b.id === bot.id);
        if (i === -1) all.unshift(toRow(bot)); else all[i] = toRow(bot);
      }),
      delete: async (id) => {
        await bots.mutate((all) => { const i = all.findIndex((b) => b.id === id); if (i !== -1) all.splice(i, 1); });
        await orders.mutate((all) => { for (let i = all.length - 1; i >= 0; i--) if (all[i].botId === id) all.splice(i, 1); });
        await unanswered.mutate((all) => { for (let i = all.length - 1; i >= 0; i--) if (all[i].botId === id) all.splice(i, 1); });
        const convIds = new Set((await conversations.read()).filter((c) => c.botId === id).map((c) => c.id));
        await conversations.mutate((all) => { for (let i = all.length - 1; i >= 0; i--) if (all[i].botId === id) all.splice(i, 1); });
        await messages.mutate((all) => { for (let i = all.length - 1; i >= 0; i--) if (convIds.has(all[i].conversationId)) all.splice(i, 1); });
      },
      claimUnowned: (ownerId) => bots.mutate((all) => {
        let n = 0;
        for (const b of all) if (!b.ownerId) { b.ownerId = ownerId; n++; }
        return n;
      }),
    },
    orders: {
      list: async (botId, { limit, offset }) => {
        await migrateLegacy();
        const mine = (await orders.read()).filter((o) => o.botId === botId).reverse();
        return { total: mine.length, orders: mine.slice(offset, offset + limit).map(({ botId: _b, ...o }) => o) };
      },
      insert: (botId, order, keep) => orders.mutate((all) => {
        all.push({ botId, ...order });
        if (keep !== null) {
          const mine = all.filter((o) => o.botId === botId);
          const excess = mine.length - keep;
          if (excess > 0) {
            const drop = new Set(mine.slice(0, excess).map((o) => o.id));
            for (let i = all.length - 1; i >= 0; i--) if (all[i].botId === botId && drop.has(all[i].id)) all.splice(i, 1);
          }
        }
      }),
    },
    unanswered: {
      list: async (botId) => {
        await migrateLegacy();
        return (await unanswered.read())
          .filter((u) => u.botId === botId)
          .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
          .map(({ botId: _b, ...u }) => u);
      },
      record: (botId, { id, question, key, now }, cap) => unanswered.mutate((all) => {
        const hit = all.find((u) => u.botId === botId && u.key === key);
        if (hit) { hit.count++; hit.lastSeen = now; return; }
        all.push({ botId, id, question, key, count: 1, firstSeen: now, lastSeen: now });
        const mine = all.filter((u) => u.botId === botId);
        if (mine.length > cap) {
          mine.sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen));
          const drop = new Set(mine.slice(cap).map((u) => u.id));
          for (let i = all.length - 1; i >= 0; i--) if (all[i].botId === botId && drop.has(all[i].id)) all.splice(i, 1);
        }
      }),
      delete: (botId, id) => unanswered.mutate((all) => {
        const i = all.findIndex((u) => u.botId === botId && u.id === id);
        if (i !== -1) all.splice(i, 1);
      }),
      clear: (botId) => unanswered.mutate((all) => { for (let i = all.length - 1; i >= 0; i--) if (all[i].botId === botId) all.splice(i, 1); }),
    },
    conversations: {
      list: async (botId, { limit, offset }) => {
        const mine = (await conversations.read()).filter((c) => c.botId === botId).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
        return { total: mine.length, conversations: mine.slice(offset, offset + limit) };
      },
      get: async (id) => (await conversations.read()).find((c) => c.id === id),
      ensure: async ({ id, botId, visitorId, pageUrl, now }, keep) => {
        const dropped: string[] = [];
        await conversations.mutate((all) => {
          if (!all.some((c) => c.id === id)) {
            all.push({ id, botId, visitorId, pageUrl, startedAt: now, lastMessageAt: now, lastMessage: "", messageCount: 0, unread: false, needsHuman: false });
          }
          if (keep !== null) {
            const mine = all.filter((c) => c.botId === botId).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
            for (const c of mine.slice(keep)) { dropped.push(c.id); all.splice(all.indexOf(c), 1); }
          }
        });
        if (dropped.length) await messages.mutate((all) => { for (let i = all.length - 1; i >= 0; i--) if (dropped.includes(all[i].conversationId)) all.splice(i, 1); });
      },
      appendMessage: async (m) => {
        let added = false;
        await messages.mutate((all) => { if (!all.some((x) => x.id === m.id)) { all.push(m); added = true; } });
        if (!added) return;
        await conversations.mutate((all) => {
          const c = all.find((x) => x.id === m.conversationId);
          if (!c) return;
          c.lastMessage = m.text.slice(0, 200);
          if (m.createdAt > c.lastMessageAt) c.lastMessageAt = m.createdAt;
          c.messageCount++;
          if (m.role === "visitor") c.unread = true; else if (m.role === "owner") c.unread = false;
          if (m.role === "visitor" && m.toTeam) c.needsHuman = true; else if (m.role === "owner") c.needsHuman = false;
        });
      },
      messages: async (conversationId, opts = {}) =>
        (await messages.read())
          .filter((m) => m.conversationId === conversationId && (!opts.after || m.createdAt > opts.after) && (!opts.roles || opts.roles.includes(m.role)))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      markRead: (id) => conversations.mutate((all) => { const c = all.find((x) => x.id === id); if (c) c.unread = false; }),
      delete: async (id) => {
        await conversations.mutate((all) => { const i = all.findIndex((c) => c.id === id); if (i !== -1) all.splice(i, 1); });
        await messages.mutate((all) => { for (let i = all.length - 1; i >= 0; i--) if (all[i].conversationId === id) all.splice(i, 1); });
      },
      deleteTest: async (botId) => {
        const ids = new Set<string>();
        await conversations.mutate((all) => {
          for (let i = all.length - 1; i >= 0; i--) if (all[i].botId === botId && isTestConversation(all[i])) { ids.add(all[i].id); all.splice(i, 1); }
        });
        if (ids.size) await messages.mutate((all) => { for (let i = all.length - 1; i >= 0; i--) if (ids.has(all[i].conversationId)) all.splice(i, 1); });
        return ids.size;
      },
    },
    payments: {
      insert: (p) => payments.mutate((all) => { all.push(p); }),
      get: async (id) => (await payments.read()).find((p) => p.id === id),
      listByUser: async (userId) => (await payments.read()).filter((p) => p.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      listByStatus: async (status, limit) => {
        const rows = (await payments.read()).filter((p) => p.status === status);
        rows.sort((a, b) => (status === "pending" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
        return rows.slice(0, limit);
      },
      review: (id, status, note, at) => payments.mutate((all) => {
        const p = all.find((x) => x.id === id);
        if (!p || p.status !== "pending") return false;
        p.status = status; p.note = note; p.reviewedAt = at;
        return true;
      }),
    },
    proofs: {
      save: async ({ buffer, originalName }) => {
        const dir = path.join(DATA_DIR, "proofs");
        await fs.mkdir(dir, { recursive: true });
        const name = `${Date.now()}_${rid(10)}${path.extname(originalName).toLowerCase()}`;
        await fs.writeFile(path.join(dir, name), buffer);
        return name;
      },
      signedUrl: async (p) => `file://proofs/${p}`,
    },
    uploads: {
      save: async ({ buffer, originalName }) => {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        const name = `${Date.now()}_${rid(6)}${path.extname(originalName).toLowerCase()}`;
        await fs.writeFile(path.join(UPLOADS_DIR, name), buffer);
        return `/uploads/${name}`;
      },
    },
    unansweredLog: {
      append: async (entry) => {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.appendFile(GLOBAL_LOG, JSON.stringify({ day: entry.day, lang: entry.lang, industry: entry.industry, q: entry.question }) + "\n");
      },
    },
  };
}

function toRow(bot: Bot): BotRow {
  const { orderCount: _o, unansweredCount: _u, unreadCount: _r, needsHumanCount: _h, ...row } = bot;
  return row;
}

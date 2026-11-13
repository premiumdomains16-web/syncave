// Supabase implementation. Uses the service-role key from the server only (never
// shipped to the browser), so Row Level Security stays on and nothing is readable
// with the anon/publishable key. Tables, triggers and functions: supabase/schema.sql.
//
// Hot paths are single statements: orders and unanswered hits go through SQL
// functions (insert + cap in one transaction), and bots carry counters kept by
// triggers, so listing a dashboard is one query regardless of traffic.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resilientFetch } from "../resilientFetch.js";
import { log } from "../log.js";
import { rid, TEST_VISITOR_PREFIX, type Bot, type ChatMessage, type Conversation, type Order, type Unanswered } from "../../shared/types.js";
import type { Database, UserRecord } from "./types.js";

const BUCKET = "uploads";

// ---- row <-> model mapping (snake_case columns, camelCase in the app) ----

function botFromRow(r: any): Bot {
  return {
    id: r.id,
    ownerId: r.owner_id ?? null,
    name: r.name,
    url: r.url,
    ...(r.template_id ? { templateId: r.template_id } : {}),
    welcomeMessage: r.welcome_message,
    fallbackMessage: r.fallback_message,
    themeColor: r.theme_color,
    logoUrl: r.logo_url ?? null,
    backgroundImageUrl: r.background_image_url ?? null,
    enableOrders: !!r.enable_orders,
    qa: r.qa ?? [],
    published: r.published ?? null,
    lastPublished: r.last_published ?? null,
    lastUpdated: r.last_updated,
    verified: !!r.verified,
    verificationToken: r.verification_token,
    orderCount: r.order_count ?? 0,
    unansweredCount: r.unanswered_count ?? 0,
    unreadCount: r.unread_count ?? 0,
    needsHumanCount: r.needs_human_count ?? 0,
  };
}

const conversationFromRow = (r: any): Conversation => ({
  id: r.id, botId: r.bot_id, visitorId: r.visitor_id, pageUrl: r.page_url ?? "", startedAt: r.started_at,
  lastMessageAt: r.last_message_at, lastMessage: r.last_message ?? "", messageCount: r.message_count ?? 0, unread: !!r.unread,
  needsHuman: !!r.needs_human,
});
const messageFromRow = (r: any): ChatMessage => ({ id: r.id, conversationId: r.conversation_id, role: r.role, text: r.text, createdAt: r.created_at, ...(r.to_team ? { toTeam: true } : {}) });

let warnedNoNeedsHuman = false;

function botToRow(b: Bot) {
  return {
    id: b.id,
    owner_id: b.ownerId,
    name: b.name,
    url: b.url,
    template_id: b.templateId ?? null,
    welcome_message: b.welcomeMessage,
    fallback_message: b.fallbackMessage,
    theme_color: b.themeColor,
    logo_url: b.logoUrl,
    background_image_url: b.backgroundImageUrl,
    enable_orders: b.enableOrders,
    qa: b.qa,
    published: b.published,
    last_published: b.lastPublished,
    last_updated: b.lastUpdated,
    verified: b.verified,
    verification_token: b.verificationToken,
    // order_count / unanswered_count / unread_count / needs_human_count are trigger-maintained; never written from here.
  };
}

const orderFromRow = (r: any): Order => ({ id: r.id, name: r.name, email: r.email, phone: r.phone ?? "", message: r.message ?? "", timestamp: r.created_at });
const unansweredFromRow = (r: any): Unanswered => ({ id: r.id, question: r.question, key: r.key, count: r.count, firstSeen: r.first_seen, lastSeen: r.last_seen });

function userFromRow(r: any): UserRecord {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    plan: r.plan,
    createdAt: r.created_at,
    ...(r.auth_id ? { authId: r.auth_id } : {}),
    ...(r.requested_plan ? { requestedPlan: r.requested_plan } : {}),
  };
}


/** Throws with a readable message instead of returning Supabase's { error } shape. */
function ok<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase ${what}: ${res.error.message}`);
  return res.data;
}

/** Server-side client (service role): no session persistence; every call has a timeout and safe retries. */
export function createSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Timeouts on every call; safe (read) calls retry with backoff on network blips.
    global: { fetch: resilientFetch },
  });
}

export function createSupabaseDatabase(url: string, serviceRoleKey: string): Database {
  const sb = createSupabaseClient(url, serviceRoleKey);

  return {
    kind: "supabase",
    users: {
      findByEmail: async (email) => {
        const rows = ok(await sb.from("users").select("*").eq("email", email).limit(1), "users.findByEmail");
        return rows?.[0] ? userFromRow(rows[0]) : undefined;
      },
      findById: async (id) => {
        const rows = ok(await sb.from("users").select("*").eq("id", id).limit(1), "users.findById");
        return rows?.[0] ? userFromRow(rows[0]) : undefined;
      },
      findByAuthId: async (authId) => {
        const rows = ok(await sb.from("users").select("*").eq("auth_id", authId).limit(1), "users.findByAuthId");
        return rows?.[0] ? userFromRow(rows[0]) : undefined;
      },
      linkAuth: async (userId, authId) => {
        ok(await sb.from("users").update({ auth_id: authId }).eq("id", userId).is("auth_id", null), "users.linkAuth");
      },
      count: async () => {
        const res = await sb.from("users").select("id", { count: "exact", head: true });
        if (res.error) throw new Error(`Supabase users.count: ${res.error.message}`);
        return res.count ?? 0;
      },
      insert: async (u) => {
        ok(await sb.from("users").insert({
          id: u.id, name: u.name, email: u.email, plan: u.plan, requested_plan: u.requestedPlan ?? null,
          auth_id: u.authId ?? null, created_at: u.createdAt,
        }), "users.insert");
      },
    },
    bots: {
      listByOwner: async (ownerId) => {
        const rows = ok(await sb.from("bots").select("*").eq("owner_id", ownerId).order("last_updated", { ascending: false }), "bots.list");
        return (rows ?? []).map(botFromRow);
      },
      get: async (id) => {
        const rows = ok(await sb.from("bots").select("*").eq("id", id).limit(1), "bots.get");
        return rows?.[0] ? botFromRow(rows[0]) : undefined;
      },
      insert: async (bot) => { ok(await sb.from("bots").insert(botToRow(bot)), "bots.insert"); },
      save: async (bot) => { ok(await sb.from("bots").upsert(botToRow(bot), { onConflict: "id" }), "bots.save"); },
      delete: async (id) => { ok(await sb.from("bots").delete().eq("id", id), "bots.delete"); }, // orders/unanswered cascade in SQL
      claimUnowned: async (ownerId) => {
        const rows = ok(await sb.from("bots").update({ owner_id: ownerId }).is("owner_id", null).select("id"), "bots.claim");
        return rows?.length ?? 0;
      },
    },
    orders: {
      list: async (botId, { limit, offset }) => {
        const res = await sb.from("orders").select("*", { count: "exact" }).eq("bot_id", botId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        if (res.error) throw new Error(`Supabase orders.list: ${res.error.message}`);
        return { orders: (res.data ?? []).map(orderFromRow), total: res.count ?? 0 };
      },
      insert: async (botId, o, keep) => {
        ok(await sb.rpc("insert_order", {
          p_bot_id: botId, p_id: o.id, p_name: o.name, p_email: o.email, p_phone: o.phone, p_message: o.message,
          p_created_at: o.timestamp, p_keep: keep,
        }), "insert_order");
      },
    },
    unanswered: {
      list: async (botId) => {
        const rows = ok(await sb.from("unanswered").select("*").eq("bot_id", botId).order("count", { ascending: false }).order("last_seen", { ascending: false }), "unanswered.list");
        return (rows ?? []).map(unansweredFromRow);
      },
      record: async (botId, e, cap) => {
        ok(await sb.rpc("record_unanswered", { p_bot_id: botId, p_id: e.id, p_question: e.question, p_key: e.key, p_now: e.now, p_cap: cap }), "record_unanswered");
      },
      delete: async (botId, id) => { ok(await sb.from("unanswered").delete().eq("bot_id", botId).eq("id", id), "unanswered.delete"); },
      clear: async (botId) => { ok(await sb.from("unanswered").delete().eq("bot_id", botId), "unanswered.clear"); },
    },
    conversations: {
      list: async (botId, { limit, offset }) => {
        const res = await sb.from("conversations").select("*", { count: "exact" }).eq("bot_id", botId).order("last_message_at", { ascending: false }).range(offset, offset + limit - 1);
        if (res.error) throw new Error(`Supabase conversations.list: ${res.error.message}`);
        return { conversations: (res.data ?? []).map(conversationFromRow), total: res.count ?? 0 };
      },
      get: async (id) => {
        const rows = ok(await sb.from("conversations").select("*").eq("id", id).limit(1), "conversations.get");
        return rows?.[0] ? conversationFromRow(rows[0]) : undefined;
      },
      ensure: async (c, keep) => {
        ok(await sb.rpc("ensure_conversation", { p_id: c.id, p_bot_id: c.botId, p_visitor_id: c.visitorId, p_page_url: c.pageUrl, p_now: c.now, p_keep: keep }), "ensure_conversation");
      },
      appendMessage: async (m) => {
        const args = { p_conversation_id: m.conversationId, p_id: m.id, p_role: m.role, p_text: m.text, p_created_at: m.createdAt };
        if (m.toTeam && m.role === "visitor") {
          const res = await sb.rpc("append_message", { ...args, p_to_team: true });
          if (!res.error) return;
          // Database not migrated yet (supabase/migrate-004-needs-human.sql): save the message without the flag.
          if (!/p_to_team|function|schema cache/i.test(res.error.message)) throw new Error(`Supabase append_message: ${res.error.message}`);
          if (!warnedNoNeedsHuman) { warnedNoNeedsHuman = true; log.warn("Run supabase/migrate-004-needs-human.sql to enable 'needs a reply' flags", { error: res.error.message }); }
        }
        ok(await sb.rpc("append_message", args), "append_message");
      },
      messages: async (conversationId, opts = {}) => {
        let q = sb.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(500);
        if (opts.after) q = q.gt("created_at", opts.after);
        if (opts.roles) q = q.in("role", opts.roles);
        return (ok(await q, "messages.list") ?? []).map(messageFromRow);
      },
      markRead: async (id) => { ok(await sb.from("conversations").update({ unread: false }).eq("id", id), "conversations.markRead"); },
      delete: async (id) => { ok(await sb.from("conversations").delete().eq("id", id), "conversations.delete"); },
      deleteTest: async (botId) => {
        // Messages cascade. "_" is a LIKE wildcard, so escape it to match the literal prefix.
        const rows = ok(await sb.from("conversations").delete().eq("bot_id", botId).like("visitor_id", TEST_VISITOR_PREFIX.replace("_", "\\_") + "%").select("id"), "conversations.deleteTest");
        return rows?.length ?? 0;
      },
    },
    uploads: {
      // originalName/mimetype come from checkImage() (detected from the file's bytes), not from the browser.
      save: async ({ buffer, originalName, mimetype }) => {
        const ext = (originalName.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
        const name = `${Date.now()}_${rid(6)}${ext}`;
        const up = await sb.storage.from(BUCKET).upload(name, buffer, { contentType: mimetype, upsert: false });
        if (up.error) throw new Error(`Supabase storage upload: ${up.error.message}`);
        return sb.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
      },
    },
    unansweredLog: {
      append: async (e) => {
        ok(await sb.from("unanswered_global").insert({ day: e.day, lang: e.lang, industry: e.industry, question: e.question }), "unanswered_global.insert");
      },
    },
  };
}

// The persistence boundary. Everything the API stores goes through this interface:
// Supabase in production (the Edge Function), local JSON files for automated tests.
//
// Design notes for scale:
// - Orders and unanswered questions live in their own collections and are
//   appended with single atomic writes — a visitor placing an order never
//   rewrites the bot row, and concurrent writers can't lose each other's data.
// - Bots carry read-only counters (orderCount / unansweredCount) so lists and
//   badges need no extra queries.
import type { Bot, ChatMessage, Conversation, Order, Plan, Unanswered, User } from "../../shared/types.js";

export interface UserRecord extends User {
  /** The Supabase Auth user id (auth.users.id) this account signs in with. */
  authId?: string;
  /** Only on accounts created before Supabase Auth; no longer used for sign-in. */
  passwordHash?: string;
  /** Paid plan picked on the pricing page before billing exists — a sales lead to follow up. */
  requestedPlan?: Plan;
}

export interface UploadInput {
  buffer: Uint8Array;
  originalName: string;
  mimetype: string;
}

export interface UnansweredGlobalEntry {
  day: string;
  lang: "ar" | "en";
  industry: string;
  question: string;
}

export interface OrdersPage {
  orders: Order[];
  total: number;
}

export interface Database {
  readonly kind: "json" | "supabase";
  users: {
    findByEmail(email: string): Promise<UserRecord | undefined>;
    findById(id: string): Promise<UserRecord | undefined>;
    findByAuthId(authId: string): Promise<UserRecord | undefined>;
    count(): Promise<number>;
    insert(user: UserRecord): Promise<void>;
    /** Connects an existing account (e.g. from before Supabase Auth) to a Supabase Auth user. */
    linkAuth(userId: string, authId: string): Promise<void>;
  };
  bots: {
    listByOwner(ownerId: string): Promise<Bot[]>;
    get(id: string): Promise<Bot | undefined>;
    insert(bot: Bot): Promise<void>;
    /** Full-row replace of the bot's own fields (counters are ignored; they're derived). */
    save(bot: Bot): Promise<void>;
    /** Removes the bot and everything attached to it (orders, unanswered). */
    delete(id: string): Promise<void>;
    /** Gives every owner-less (pre-accounts) bot to `ownerId`. Returns how many were claimed. */
    claimUnowned(ownerId: string): Promise<number>;
  };
  orders: {
    /** Newest first. */
    list(botId: string, opts: { limit: number; offset: number }): Promise<OrdersPage>;
    /** Appends one order; when `keep` is set, the oldest beyond that many are removed. */
    insert(botId: string, order: Order, keep: number | null): Promise<void>;
  };
  unanswered: {
    /** Most asked first, then most recent. */
    list(botId: string): Promise<Unanswered[]>;
    /** Counts a fallback hit: bumps an existing entry with the same key or adds one; keeps at most `cap` entries. */
    record(botId: string, entry: { id: string; question: string; key: string; now: string }, cap: number): Promise<void>;
    delete(botId: string, id: string): Promise<void>;
    clear(botId: string): Promise<void>;
  };
  conversations: {
    /** Most recent activity first. */
    list(botId: string, opts: { limit: number; offset: number }): Promise<{ conversations: Conversation[]; total: number }>;
    get(id: string): Promise<Conversation | undefined>;
    /** Creates the conversation if new; keeps at most `keep` per bot. */
    ensure(c: { id: string; botId: string; visitorId: string; pageUrl: string; now: string }, keep: number | null): Promise<void>;
    /** Appends a message and updates the conversation summary/unread flag atomically. */
    appendMessage(m: ChatMessage): Promise<void>;
    /** Messages in order; `after` (ISO time) and `roles` narrow the result for widget polling. */
    messages(conversationId: string, opts?: { after?: string; roles?: ChatMessage["role"][] }): Promise<ChatMessage[]>;
    markRead(id: string): Promise<void>;
    delete(id: string): Promise<void>;
    /** Removes every test conversation (from the owner's preview) of a bot; returns how many. */
    deleteTest(botId: string): Promise<number>;
  };
  uploads: {
    /** Stores an image and returns the URL the dashboard/widget should use. */
    save(file: UploadInput): Promise<string>;
  };
  unansweredLog: {
    append(entry: UnansweredGlobalEntry): Promise<void>;
  };
}

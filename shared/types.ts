// Data shapes shared by the server (server/) and the dashboard (src/).

export interface QA {
  id: string;
  question: string;
  answer: string;
}

/** A visitor question that hit the fallback on the live widget, grouped by spelling-insensitive key. */
export interface Unanswered {
  id: string;
  /** The first spelling seen (shown to the owner). */
  question: string;
  /** Dedupe key — see shared/normalize.ts questionKey(). */
  key: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

/** One visitor's chat with the widget on the live site. */
export interface Conversation {
  id: string;
  botId: string;
  /** Stable per browser (localStorage); only ever shown truncated. */
  visitorId: string;
  pageUrl: string;
  startedAt: string;
  lastMessageAt: string;
  lastMessage: string;
  messageCount: number;
  /** True when the newest message is from the visitor and nobody has opened it yet. */
  unread: boolean;
  /** The visitor wrote to the team (or asked something the bot couldn't answer) and is waiting for a person. Cleared by an owner reply. */
  needsHuman: boolean;
}

/** Test chats come from the owner's own preview, never from real visitors (the public API rejects this prefix). */
export const TEST_VISITOR_PREFIX = "test_";
export const isTestConversation = (c: { visitorId: string }) => c.visitorId.startsWith(TEST_VISITOR_PREFIX);

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "visitor" | "bot" | "owner";
  text: string;
  createdAt: string;
  /** A visitor message meant for a person, not the bot. */
  toTeam?: boolean;
}

export interface Order {
  id: string;
  name: string;
  /** Optional (phone is the main contact); empty string when not given. */
  email: string;
  phone: string;
  /** Delivery address; empty when not given. */
  address: string;
  /** What they want to order. */
  message: string;
  timestamp: string;
}

/** The fields a site owner edits in the dashboard and snapshots on publish. */
export interface BotContent {
  qa: QA[];
  welcomeMessage: string;
  fallbackMessage: string;
  themeColor: string;
  logoUrl: string | null;
  backgroundImageUrl: string | null;
  enableOrders: boolean;
}

export const CONTENT_KEYS: (keyof BotContent)[] = [
  "qa",
  "welcomeMessage",
  "fallbackMessage",
  "themeColor",
  "logoUrl",
  "backgroundImageUrl",
  "enableOrders",
];

export interface PublishedSnapshot extends BotContent {
  publishedAt: string;
}

export type Plan = "free" | "starter" | "business" | "agency";

/** An account as the dashboard sees it (never includes the password hash). */
export interface User {
  id: string;
  name: string;
  email: string;
  /** The plan in effect now (a paid plan past its end date counts as free). */
  plan: Plan;
  /** When the paid period ends; null for Free or plans without an end date. */
  planExpiresAt?: string | null;
  /** Can review payments (Admin page). Only set on the signed-in user's own record. */
  isAdmin?: boolean;
  createdAt: string;
}

export interface Bot extends BotContent {
  id: string;
  /** Account that owns this bot; null only for legacy data before accounts existed. */
  ownerId: string | null;
  name: string;
  url: string;
  /** Number of stored orders (orders themselves are fetched per page). Read-only. */
  orderCount: number;
  /** Number of distinct unanswered questions (fetched on the Unanswered tab). Read-only. */
  unansweredCount: number;
  /** Conversations with a visitor message nobody has read yet. Read-only. */
  unreadCount: number;
  /** Conversations waiting for a reply from a person. */
  needsHumanCount: number;
  /** Template the site started from (for the anonymized global unanswered log). */
  templateId?: string;
  // Live state — what the widget serves
  published: PublishedSnapshot | null;
  lastPublished: string | null;
  lastUpdated: string;
  verified: boolean;
  verificationToken: string;
}

/** Fields the dashboard may change via PATCH /api/bots/:id. */
export type BotPatch = Partial<Pick<Bot, "name" | keyof BotContent>>;

export function pickContent(src: BotContent): BotContent {
  return {
    qa: src.qa.map((q) => ({ ...q })),
    welcomeMessage: src.welcomeMessage,
    fallbackMessage: src.fallbackMessage,
    themeColor: src.themeColor,
    logoUrl: src.logoUrl,
    backgroundImageUrl: src.backgroundImageUrl,
    enableOrders: src.enableOrders,
  };
}

export function hasUnpublishedChanges(bot: Bot): boolean {
  if (!bot.published) {
    return bot.qa.length > 0 || !!bot.welcomeMessage || !!bot.fallbackMessage;
  }
  const live = bot.published;
  return CONTENT_KEYS.some((k) =>
    k === "qa" ? JSON.stringify(bot.qa) !== JSON.stringify(live.qa) : bot[k] !== live[k]
  );
}

const RID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Random id of exactly `len` characters [0-9a-z], from the platform's secure generator (browser and Node). */
export function rid(len = 8) {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  // 252 is the largest multiple of 36 below 256: re-roll anything above it so every character is equally likely.
  for (let i = 0; i < len; i++) {
    let b = bytes[i];
    while (b >= 252) b = globalThis.crypto.getRandomValues(new Uint8Array(1))[0];
    out += RID_ALPHABET[b % 36];
  }
  return out;
}

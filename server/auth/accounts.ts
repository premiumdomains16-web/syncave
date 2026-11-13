// Users and login sessions, on top of server/db (JSON files or Supabase).
import { createHash, randomBytes } from "crypto";
import { rid, type Plan, type User } from "../../shared/types.js";
import { db } from "../db/index.js";
import type { SessionRecord, UserRecord } from "../db/types.js";

export type { SessionRecord, UserRecord };

const SESSION_DAYS = 30;

/**
 * Every dashboard request resolves cookie → session → user. Remember the result
 * briefly so a busy dashboard costs one database round-trip per half minute per
 * user instead of two per request. Logout clears the entry immediately; a plan
 * change made in the database shows up within the TTL.
 */
const SESSION_CACHE_MS = 30_000;
const sessionCache = new Map<string, { user: UserRecord; until: number }>();

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function toPublicUser(u: UserRecord): User {
  return { id: u.id, name: u.name, email: u.email, plan: u.plan, createdAt: u.createdAt };
}

export function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  return db().users.findByEmail(normalizeEmail(email));
}

export function findUserById(id: string): Promise<UserRecord | undefined> {
  return db().users.findById(id);
}

export class EmailTaken extends Error {}

/** Creates the account. `isFirst` is true when this is the very first account on the server. */
export async function createUser(input: { name: string; email: string; passwordHash: string; requestedPlan?: Plan }) {
  const email = normalizeEmail(input.email);
  if (await db().users.findByEmail(email)) throw new EmailTaken("An account with this email already exists.");
  const isFirst = (await db().users.count()) === 0;
  const user: UserRecord = {
    id: `u_${rid(10)}`,
    name: input.name.trim().substring(0, 80),
    email,
    plan: "free",
    ...(input.requestedPlan && input.requestedPlan !== "free" ? { requestedPlan: input.requestedPlan } : {}),
    createdAt: new Date().toISOString(),
    passwordHash: input.passwordHash,
  };
  await db().users.insert(user);
  return { user, isFirst };
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  // Opportunistic cleanup; cheap and keeps the table small.
  db().sessions.pruneExpired(now).catch(() => {});
  await db().sessions.insert({ tokenHash: hashToken(token), userId, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });
  return { token, expiresAt };
}

export async function userForSession(token: string | undefined): Promise<UserRecord | undefined> {
  if (!token) return undefined;
  const h = hashToken(token);
  const cached = sessionCache.get(h);
  if (cached && cached.until > Date.now()) return cached.user;

  const session = await db().sessions.find(h);
  if (!session || new Date(session.expiresAt) <= new Date()) { sessionCache.delete(h); return undefined; }
  const user = await findUserById(session.userId);
  if (!user) return undefined;
  if (sessionCache.size > 5_000) sessionCache.clear();
  sessionCache.set(h, { user, until: Date.now() + SESSION_CACHE_MS });
  return user;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const h = hashToken(token);
  sessionCache.delete(h);
  await db().sessions.delete(h);
}

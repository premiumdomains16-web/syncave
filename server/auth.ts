// Signed-in users. The dashboard signs in with Supabase Auth and sends its access
// token as `Authorization: Bearer <token>`; here we turn that token into the
// Syncave account (public.users row) that owns bots and carries the plan.
import { createClient } from "@supabase/supabase-js";
import type { MiddlewareHandler } from "hono";
import { rid, type Plan, type User } from "../shared/types.js";
import { db, type UserRecord } from "./db/index.js";
import { HttpError } from "./errors.js";
import { resilientFetch } from "./resilientFetch.js";

/** Who a valid token belongs to, as reported by Supabase Auth. */
export interface AuthIdentity {
  id: string;
  email: string;
  emailConfirmed: boolean;
  name?: string;
  requestedPlan?: string;
}

export type VerifyToken = (token: string) => Promise<AuthIdentity | null>;

/** Production verifier: asks Supabase Auth to validate the token. */
export function supabaseTokenVerifier(url: string, serviceRoleKey: string): VerifyToken {
  const sb = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: resilientFetch },
  });
  return async (token) => {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    const u = data.user;
    return {
      id: u.id,
      email: u.email ?? "",
      emailConfirmed: !!u.email_confirmed_at,
      name: typeof u.user_metadata?.name === "string" ? u.user_metadata.name : undefined,
      requestedPlan: typeof u.user_metadata?.requested_plan === "string" ? u.user_metadata.requested_plan : undefined,
    };
  };
}

const PAID: Plan[] = ["starter", "business", "agency"];

export function toPublicUser(u: UserRecord): User {
  return { id: u.id, name: u.name, email: u.email, plan: u.plan, createdAt: u.createdAt };
}

/**
 * The Syncave account for a Supabase Auth user, created on first use.
 * An account from before Supabase Auth (same email) is linked instead — but only
 * once the email is confirmed, so nobody can take over an account by signing up
 * with someone else's address.
 */
export async function accountFor(identity: AuthIdentity): Promise<UserRecord> {
  const found = await db().users.findByAuthId(identity.id);
  if (found) return found;

  const email = identity.email.trim().toLowerCase();
  if (!email) throw new HttpError(403, "Your login has no email address.");
  const existing = await db().users.findByEmail(email);
  if (existing) {
    if (existing.authId && existing.authId !== identity.id) throw new HttpError(409, "This email is already linked to another login.");
    if (!identity.emailConfirmed) throw new HttpError(403, "Please confirm your email address first. Check your inbox for the link.");
    await db().users.linkAuth(existing.id, identity.id);
    return { ...existing, authId: identity.id };
  }

  const isFirst = (await db().users.count()) === 0;
  const requested = PAID.find((p) => p === identity.requestedPlan);
  const user: UserRecord = {
    id: `u_${rid(10)}`,
    authId: identity.id,
    name: (identity.name?.trim() || email.split("@")[0]).substring(0, 80),
    email,
    plan: "free",
    ...(requested ? { requestedPlan: requested } : {}),
    createdAt: new Date().toISOString(),
  };
  try {
    await db().users.insert(user);
  } catch (e) {
    // Two first requests raced; the other one created it.
    const again = await db().users.findByAuthId(identity.id);
    if (again) return again;
    throw e;
  }
  // Sites created before accounts existed belong to whoever sets the project up.
  if (isFirst) await db().bots.claimUnowned(user.id);
  return user;
}

/**
 * Token → account, remembered briefly so a busy dashboard costs one Auth round-trip
 * per half minute per user. A plan changed in the database shows up within the TTL.
 */
const CACHE_MS = 30_000;
const cache = new Map<string, { user: UserRecord; until: number }>();

export type AuthVars = { user: User };

export function requireUser(verify: VerifyToken): MiddlewareHandler<{ Variables: AuthVars }> {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    if (!token) return c.json({ error: "Please log in." }, 401);

    const hit = cache.get(token);
    let user = hit && hit.until > Date.now() ? hit.user : undefined;
    if (!user) {
      const identity = await verify(token);
      if (!identity) return c.json({ error: "Please log in." }, 401);
      user = await accountFor(identity);
      if (cache.size > 5_000) cache.clear();
      cache.set(token, { user, until: Date.now() + CACHE_MS });
    }
    c.set("user", toPublicUser(user));
    await next();
  };
}

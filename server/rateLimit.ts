import type { Context, MiddlewareHandler } from "hono";

/** The visitor's IP as reported by Supabase's edge proxy. */
export function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || "unknown";
}

/**
 * Fixed-window, in-memory rate limiter keyed by client IP. Each Edge Function
 * instance keeps its own counters, so this is a best-effort brake against floods,
 * not an exact global quota.
 */
export function rateLimit({ windowMs, max, message }: { windowMs: number; max: number; message: string }): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const now = Date.now();
    const key = clientIp(c);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    entry.count++;
    if (entry.count > max) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json({ error: message }, 429);
    }
    await next();
  };
}

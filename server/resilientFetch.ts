// fetch with a timeout on every call, plus retries with exponential backoff for
// requests that are safe to repeat. Used by the Supabase client so a slow or
// briefly unavailable database fails fast instead of hanging a request.
import { log } from "./log.js";

const TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS) || 10_000;
const RETRIES = 2;                 // so at most 3 attempts
const BASE_DELAY_MS = 200;         // 200 ms, then 400 ms (+ jitter)
const RETRY_STATUS = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET/HEAD are idempotent. Writes (POST/PATCH/DELETE, RPC calls) are never retried, so they can't run twice. */
const isRetryable = (method: string) => method === "GET" || method === "HEAD";

export const resilientFetch: typeof fetch = async (input, init: RequestInit = {}) => {
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = init.signal && typeof AbortSignal.any === "function" ? AbortSignal.any([init.signal, timeout]) : init.signal ?? timeout;
    try {
      const res = await fetch(input, { ...init, signal });
      if (attempt < RETRIES && isRetryable(method) && RETRY_STATUS.has(res.status)) {
        log.warn("db request retry", { status: res.status, attempt: attempt + 1 });
      } else {
        return res;
      }
    } catch (err) {
      // The caller cancelled: don't retry.
      if (init.signal?.aborted) throw err;
      if (attempt >= RETRIES || !isRetryable(method)) {
        throw timeout.aborted ? new Error(`Database request timed out after ${TIMEOUT_MS} ms`) : err;
      }
      log.warn("db request retry", { error: (err as Error).message, attempt: attempt + 1 });
    }
    await sleep(BASE_DELAY_MS * 2 ** attempt + Math.random() * 100);
  }
};

// Structured logging: one JSON object per line in production (easy to search and
// ship to a log service), readable single lines in development. No dependencies.
import { randomBytes } from "crypto";
import type { RequestHandler } from "express";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const isProd = () => process.env.NODE_ENV === "production";

function write(level: Level, msg: string, fields: Fields = {}) {
  if (level === "debug" && !process.env.LOG_DEBUG) return;
  const out = level === "error" || level === "warn" ? console.error : console.log;
  if (isProd()) {
    out(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
  } else {
    const extra = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ");
    out(`[${level}] ${msg}${extra ? " " + extra : ""}`);
  }
}

export const log = {
  debug: (msg: string, f?: Fields) => write("debug", msg, f),
  info: (msg: string, f?: Fields) => write("info", msg, f),
  warn: (msg: string, f?: Fields) => write("warn", msg, f),
  error: (msg: string, f?: Fields) => write("error", msg, f),
};

/** Serializes an unknown thrown value for a log line. */
export function errFields(err: unknown): Fields {
  if (err instanceof Error) return { error: err.message, stack: err.stack?.split("\n").slice(0, 6).join(" | ") };
  return { error: String(err) };
}

/**
 * Gives every request an id (kept from an upstream proxy's X-Request-Id when present),
 * returns it in the response header, and logs API requests when they finish:
 * failures and slow requests always, everything else only with LOG_REQUESTS=1.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const incoming = req.get("x-request-id");
  const id = incoming && /^[\w.-]{6,80}$/.test(incoming) ? incoming : randomBytes(8).toString("hex");
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  if (!req.path.startsWith("/api")) return next();

  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const fields = { requestId: id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) };
    if (res.statusCode >= 500) log.error("request failed", fields);
    else if (ms > 2000) log.warn("slow request", fields);
    else if (process.env.LOG_REQUESTS) log.info("request", fields);
  });
  next();
};

// Structured logging: one JSON object per line (Supabase → Edge Functions → Logs can
// search these). No dependencies; works in Deno and Node.
import { env } from "./env.js";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function write(level: Level, msg: string, fields: Fields = {}) {
  if (level === "debug" && !env("LOG_DEBUG")) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
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

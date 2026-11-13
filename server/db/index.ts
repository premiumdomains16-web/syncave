// The active database. The entry point decides which one: server/edge.ts sets Supabase
// (production), scripts/test-api.ts sets the local JSON store (tests).
import type { Database } from "./types.js";

export type { Database, UserRecord, UploadInput } from "./types.js";

let instance: Database | undefined;

export function db(): Database {
  if (!instance) throw new Error("Database not configured: call setDatabase() at startup.");
  return instance;
}

export function setDatabase(d: Database) {
  instance = d;
}

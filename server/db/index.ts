// Picks the database from the environment. Set SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY to use Supabase; otherwise local JSON files in DATA_DIR.
import type { Database } from "./types.js";
import { createJsonDatabase } from "./json.js";
import { createSupabaseDatabase } from "./supabase.js";

export type { Database, SessionRecord, UserRecord, UploadInput } from "./types.js";

let instance: Database | undefined;

export function db(): Database {
  if (!instance) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (url && key) {
      instance = createSupabaseDatabase(url, key);
      console.log(`Database: Supabase (${new URL(url).host})`);
    } else {
      instance = createJsonDatabase();
      console.log("Database: local JSON files (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to use Supabase)");
    }
  }
  return instance;
}

/** Test hook: swap the active database (e.g. point at a scratch directory). */
export function setDatabase(d: Database) {
  instance = d;
}

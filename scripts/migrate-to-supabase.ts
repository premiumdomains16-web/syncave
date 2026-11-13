// One-shot import of the local JSON data into Supabase.
//
//   npx tsx scripts/migrate-to-supabase.ts            # dry run: shows what would move
//   npx tsx scripts/migrate-to-supabase.ts --apply    # writes to Supabase
//
// Reads DATA_DIR (default ./data): users.json, sessions.json, bots.json,
// uploads/*, unanswered-global.jsonl. Needs SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY in .env.local / .env. Safe to re-run: rows are upserted.
import fs from "fs/promises";
import path from "path";
import { config as loadEnv } from "dotenv";
import { DATA_DIR, ROOT, UPLOADS_DIR } from "../server/paths.js";
import { normalizeBot } from "../server/db/json.js";
import { createSupabaseClient, createSupabaseDatabase } from "../server/db/supabase.js";

loadEnv({ path: [path.join(ROOT, ".env.local"), path.join(ROOT, ".env")], quiet: true });

const apply = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local) first.");
  process.exit(1);
}

async function readJson<T>(file: string): Promise<T[]> {
  try { const raw = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf-8")); return Array.isArray(raw) ? raw : []; } catch { return []; }
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };

async function main() {
  const db = createSupabaseDatabase(url!, key!);
  const sb = createSupabaseClient(url!, key!);

  const users = await readJson<any>("users.json");
  const sessions = await readJson<any>("sessions.json");
  const bots = (await readJson<any>("bots.json")).map(normalizeBot);
  let logLines: string[] = [];
  try { logLines = (await fs.readFile(path.join(DATA_DIR, "unanswered-global.jsonl"), "utf-8")).split("\n").filter(Boolean); } catch {}

  console.log(`${apply ? "Migrating" : "Dry run"} from ${DATA_DIR}`);
  console.log(`  users: ${users.length}, sessions: ${sessions.length}, bots: ${bots.length}, global log lines: ${logLines.length}`);

  // Images referenced by bots → storage bucket; rewrite URLs.
  const imageMap = new Map<string, string>();
  const refs = new Set<string>();
  for (const b of bots) for (const u of [b.logoUrl, b.backgroundImageUrl, b.published?.logoUrl, b.published?.backgroundImageUrl]) if (u && u.startsWith("/uploads/")) refs.add(u);
  console.log(`  images referenced: ${refs.size}`);
  for (const ref of refs) {
    const file = path.join(UPLOADS_DIR, path.basename(ref));
    try {
      const buffer = await fs.readFile(file);
      if (apply) {
        const ext = path.extname(file).toLowerCase();
        const newUrl = await db.uploads.save({ buffer, originalName: path.basename(file), mimetype: MIME[ext] ?? "application/octet-stream" });
        imageMap.set(ref, newUrl);
      }
    } catch { console.warn(`  ! missing image file for ${ref} — reference will be kept as-is`); }
  }
  const remap = (u: string | null) => (u && imageMap.get(u)) || u;

  if (!apply) { console.log("\nNothing written. Re-run with --apply to migrate."); return; }

  // Users first (bots and sessions reference them).
  for (const u of users) {
    const { error } = await sb.from("users").upsert({
      id: u.id, name: u.name, email: u.email, plan: u.plan ?? "free", requested_plan: u.requestedPlan ?? null,
      password_hash: u.passwordHash, created_at: u.createdAt ?? new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw new Error(`users ${u.email}: ${error.message}`);
  }
  console.log(`  ✓ users`);

  const now = new Date();
  for (const s of sessions) {
    if (new Date(s.expiresAt) <= now) continue;
    const { error } = await sb.from("sessions").upsert({ token_hash: s.tokenHash, user_id: s.userId, created_at: s.createdAt, expires_at: s.expiresAt }, { onConflict: "token_hash" });
    if (error) throw new Error(`sessions: ${error.message}`);
  }
  console.log(`  ✓ sessions (expired ones skipped)`);

  let nOrders = 0, nUnanswered = 0;
  for (const b of bots) {
    const { orders: legacyOrders, unanswered: legacyUnanswered, ...row } = b as any;
    const bot = {
      ...row,
      orderCount: 0,
      unansweredCount: 0,
      logoUrl: remap(row.logoUrl),
      backgroundImageUrl: remap(row.backgroundImageUrl),
      published: row.published ? { ...row.published, logoUrl: remap(row.published.logoUrl), backgroundImageUrl: remap(row.published.backgroundImageUrl) } : null,
    };
    await db.bots.save(bot);
    for (const o of (Array.isArray(legacyOrders) ? legacyOrders : [])) { await db.orders.insert(bot.id, o, null); nOrders++; }
    for (const u of (Array.isArray(legacyUnanswered) ? legacyUnanswered : [])) {
      await db.unanswered.record(bot.id, { id: u.id, question: u.question, key: u.key, now: u.lastSeen ?? new Date().toISOString() }, 200);
      nUnanswered++;
    }
  }
  // Orders/unanswered that newer local versions keep in their own files.
  for (const o of await readJson<any>("orders.json")) { await db.orders.insert(o.botId, o, null); nOrders++; }
  for (const u of await readJson<any>("unanswered.json")) { await db.unanswered.record(u.botId, { id: u.id, question: u.question, key: u.key, now: u.lastSeen }, 200); nUnanswered++; }
  console.log(`  ✓ bots (+ ${nOrders} orders, ${nUnanswered} unanswered)`);

  for (const line of logLines) {
    try {
      const e = JSON.parse(line);
      await db.unansweredLog.append({ day: e.day, lang: e.lang === "ar" ? "ar" : "en", industry: e.industry ?? "unknown", question: e.q ?? e.question ?? "" });
    } catch {}
  }
  console.log(`  ✓ unanswered_global`);
  console.log("\nDone. Start the server with the same env vars and it will use Supabase.");
}

main().catch((e) => { console.error(e); process.exit(1); });

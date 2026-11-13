// Backup / restore for the local-file database (DATA_DIR). With Supabase, use
// Supabase's own backups instead (Project → Database → Backups).
//
//   npm run backup                      → copies DATA_DIR to ./backups/<timestamp>/
//   npm run backup -- --keep 14         → same, and deletes all but the newest 14 backups
//   npm run backup -- --restore <dir>   → copies a backup back into DATA_DIR
//                                         (stop the server first; the current data is
//                                          saved to ./backups/before-restore-<timestamp>/)
import fs from "fs/promises";
import path from "path";
import { DATA_DIR, ROOT } from "../server/paths.js";

const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT, "backups");
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

async function exists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function backup(target: string) {
  if (!(await exists(DATA_DIR))) {
    console.log(`Nothing to back up: ${DATA_DIR} doesn't exist.`);
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  // Skip half-written temp files from an in-progress atomic write.
  await fs.cp(DATA_DIR, target, { recursive: true, filter: (src) => !src.endsWith(".tmp") });
  console.log(`Backed up ${DATA_DIR} → ${target}`);
}

async function prune(keep: number) {
  const names = (await fs.readdir(BACKUP_DIR).catch(() => [] as string[])).filter((n) => /^\d{4}-/.test(n)).sort();
  for (const old of names.slice(0, Math.max(names.length - keep, 0))) {
    await fs.rm(path.join(BACKUP_DIR, old), { recursive: true, force: true });
    console.log(`Removed old backup ${old}`);
  }
}

async function restore(from: string) {
  const source = path.resolve(from);
  if (!(await exists(source))) throw new Error(`Backup not found: ${source}`);
  await backup(path.join(BACKUP_DIR, `before-restore-${stamp()}`));
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.cp(source, DATA_DIR, { recursive: true });
  console.log(`Restored ${source} → ${DATA_DIR}`);
}

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };

(async () => {
  const from = flag("--restore");
  if (from) return restore(from);
  await backup(path.join(BACKUP_DIR, stamp()));
  const keep = Number(flag("--keep"));
  if (keep > 0) await prune(keep);
})().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

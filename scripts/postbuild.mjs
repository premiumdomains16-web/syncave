// After `vite build`: bake the API address into dist/widget.js, so the snippet
// customers paste (<script src="https://<site>/widget.js?id=...">) knows where the
// Supabase Edge Function lives.
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnv } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv("production", root, "");
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const apiBase = (env.VITE_API_URL || (supabaseUrl ? `${supabaseUrl}/functions/v1` : "")).replace(/\/+$/, "");

if (!apiBase) {
  console.error("postbuild: set SUPABASE_URL (or VITE_API_URL) in .env.local; the widget needs to know where the API is.");
  process.exit(1);
}

const file = path.join(root, "dist", "widget.js");
const src = await fs.readFile(file, "utf8");
if (!src.includes("__SYNCAVE_API_BASE__")) throw new Error("postbuild: placeholder not found in dist/widget.js");
await fs.writeFile(file, src.replace('"__SYNCAVE_API_BASE__"', JSON.stringify(apiBase)));
console.log(`postbuild: widget.js → API ${apiBase}`);

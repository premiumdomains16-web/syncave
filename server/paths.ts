import path from "path";
import { fileURLToPath } from "url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// DATA_DIR can point elsewhere (e.g. a persistent disk in production, or a test copy).
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const WIDGET_FILE = path.join(PUBLIC_DIR, "widget.js");
// Customer uploads are runtime data (not build input), so they live with the rest of DATA_DIR.
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const DIST_DIR = path.join(ROOT, "dist");

// A tiny JSON-file "table": whole-file reads, atomic writes, and a per-file
// write queue so concurrent read-modify-write cycles can't lose updates.
// Swap this module for a real database later; callers only see read/mutate.
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "./paths.js";

export interface JsonStore<T> {
  read(): Promise<T[]>;
  mutate<R>(fn: (rows: T[]) => R | Promise<R>): Promise<R>;
}

export function createJsonStore<T>(fileName: string, normalize: (raw: any) => T = (r) => r): JsonStore<T> {
  const file = path.join(DATA_DIR, fileName);
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<T[]> {
    try {
      const raw = JSON.parse(await fs.readFile(file, "utf-8"));
      return Array.isArray(raw) ? raw.map(normalize) : [];
    } catch {
      return [];
    }
  }

  async function write(rows: T[]) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Temp file + rename, so a crash mid-write can't truncate the data.
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf-8");
    await fs.rename(tmp, file);
  }

  function mutate<R>(fn: (rows: T[]) => R | Promise<R>): Promise<R> {
    const run = queue.then(async () => {
      const rows = await read();
      const result = await fn(rows);
      await write(rows);
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }

  return { read, mutate };
}

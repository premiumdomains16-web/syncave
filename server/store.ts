// Bot persistence helpers used by the routes. Backed by server/db (JSON files or
// Supabase). Mutations are read-modify-write; a per-bot queue keeps concurrent
// requests for the same bot (e.g. two visitors ordering at once) from clobbering
// each other within this process.
import type { Bot } from "../shared/types.js";
import { db } from "./db/index.js";

export class NotFound extends Error {}

const queues = new Map<string, Promise<unknown>>();

function withBotLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(id) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const settled = run.catch(() => {});
  queues.set(id, settled);
  settled.then(() => { if (queues.get(id) === settled) queues.delete(id); });
  return run;
}

/** Public lookup (widget endpoints) — ignores ownership. */
export function findBot(id: string): Promise<Bot | undefined> {
  return db().bots.get(id);
}

/** Run `fn` against a single bot and persist the result; throws NotFound if missing. */
export function mutateBot<T>(id: string, fn: (bot: Bot) => T | Promise<T>): Promise<T> {
  return withBotLock(id, async () => {
    const bot = await db().bots.get(id);
    if (!bot) throw new NotFound("Bot not found");
    const result = await fn(bot);
    await db().bots.save(bot);
    return result;
  });
}

// ---- Owner-scoped access (dashboard). Another account's bot is reported as
// "not found" so ids can't be probed. ----

export function listOwnedBots(ownerId: string): Promise<Bot[]> {
  return db().bots.listByOwner(ownerId);
}

export async function findOwnedBot(ownerId: string, id: string): Promise<Bot> {
  const bot = await db().bots.get(id);
  if (!bot || bot.ownerId !== ownerId) throw new NotFound("Bot not found");
  return bot;
}

export function mutateOwnedBot<T>(ownerId: string, id: string, fn: (bot: Bot) => T | Promise<T>): Promise<T> {
  return withBotLock(id, async () => {
    const bot = await db().bots.get(id);
    if (!bot || bot.ownerId !== ownerId) throw new NotFound("Bot not found");
    const result = await fn(bot);
    await db().bots.save(bot);
    return result;
  });
}

export function insertBot(bot: Bot): Promise<void> {
  return db().bots.insert(bot);
}

export async function deleteOwnedBot(ownerId: string, id: string): Promise<void> {
  await findOwnedBot(ownerId, id);
  await db().bots.delete(id);
}

/** Gives every owner-less (pre-accounts) bot to `ownerId`. Returns how many were claimed. */
export function claimUnownedBots(ownerId: string): Promise<number> {
  return db().bots.claimUnowned(ownerId);
}

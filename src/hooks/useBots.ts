import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bot, BotPatch } from '@shared/types';
import { api } from '@/lib/api';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 600;

/**
 * Owns the list of bots and keeps it in sync with the server.
 * Edits are applied optimistically and autosaved: patches for the same bot are
 * merged and sent once the user pauses typing.
 */
export function useBots() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const pending = useRef<Record<string, BotPatch>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inflight = useRef(0);

  const replaceBot = useCallback((bot: Bot) => {
    setBots((prev) => prev.map((b) => (b.id === bot.id ? bot : b)));
  }, []);

  const reload = useCallback(async () => {
    try {
      setBots(await api.listBots());
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const flush = useCallback(async (id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    const patch = pending.current[id];
    if (!patch) return;
    delete pending.current[id];
    inflight.current++;
    setSaveState('saving');
    try {
      await api.patchBot(id, patch);
      inflight.current--;
      if (inflight.current === 0 && Object.keys(pending.current).length === 0) setSaveState('saved');
    } catch {
      inflight.current--;
      // Put the patch back (under any newer edits) so the next save retries it.
      pending.current[id] = { ...patch, ...pending.current[id] };
      setSaveState('error');
      throw new Error('Your latest changes could not be saved.');
    }
  }, []);

  // Last-chance save when the tab closes.
  useEffect(() => {
    const onUnload = () => {
      for (const [id, patch] of Object.entries(pending.current)) {
        fetch(`/api/bots/${id}`, {
          method: 'PATCH', keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const update = useCallback((id: string, patch: BotPatch) => {
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    pending.current[id] = { ...pending.current[id], ...patch };
    setSaveState('saving');
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => { flush(id).catch(() => {}); }, AUTOSAVE_MS);
  }, [flush]);

  const create = useCallback(async (url: string, templateId: string) => {
    const bot = await api.createBot(url, templateId);
    setBots((prev) => [bot, ...prev]);
    return bot;
  }, []);

  const remove = useCallback(async (id: string) => {
    clearTimeout(timers.current[id]);
    delete pending.current[id];
    await api.deleteBot(id);
    setBots((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const verify = useCallback(async (id: string) => {
    const { bot } = await api.verify(id);
    // Keep local draft edits; only take the verified flag from the server.
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, verified: bot.verified } : b)));
  }, []);

  const publish = useCallback(async (id: string) => {
    await flush(id);
    replaceBot(await api.publish(id));
  }, [flush, replaceBot]);

  const discard = useCallback(async (id: string) => {
    clearTimeout(timers.current[id]);
    delete pending.current[id];
    replaceBot(await api.discard(id));
  }, [replaceBot]);

  const upload = useCallback(async (id: string, field: 'logoUrl' | 'backgroundImageUrl', file: File) => {
    const result = await api.upload(id, field, file);
    // The server already stored the URL, so update local state without re-sending it.
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, ...result } : b)));
  }, []);

  /** Tabs that load their own lists report back the counts shown in badges and the overview. */
  const setCounts = useCallback((id: string, counts: { orderCount?: number; unansweredCount?: number; unreadCount?: number; needsHumanCount?: number }) => {
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, ...counts } : b)));
  }, []);

  return { bots, loaded, loadError, reload, saveState, update, create, remove, verify, publish, discard, upload, setCounts };
}

export type BotsApi = ReturnType<typeof useBots>;

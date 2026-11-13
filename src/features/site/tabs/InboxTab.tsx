import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot as BotIcon, ExternalLink, FlaskConical, Hand, Inbox, Mail, RefreshCw, Send, Trash2, User } from 'lucide-react';
import { isTestConversation, type Bot, type ChatMessage, type Conversation } from '@shared/types';
import { api } from '@/lib/api';
import { formatDateTime, hostname, timeAgo } from '@/lib/format';
import { Button, Card, EmptyState, IconButton, SectionHeader, TextArea } from '@/components/ui';
import { RowsSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { UpgradeLink, usePlan } from '@/components/PlanLock';

const PAGE = 30;
const POLL_MS = 10_000;

interface Props { bot: Bot; onCounts: (c: { unreadCount: number; needsHumanCount: number }) => void; }

/** Visitor conversations from the live widget, with replies that reach the visitor's chat. */
export function InboxTab({ bot, onCounts }: Props) {
  const notify = useToast();
  const { limits, name: planName } = usePlan();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ conversation: Conversation; messages: ChatMessage[] } | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'all' | 'human'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Report counts to the parent after render (never from inside a state updater).
  useEffect(() => { if (list) onCounts({ unreadCount: list.filter((c) => c.unread).length, needsHumanCount: list.filter((c) => c.needsHuman).length }); }, [list]);

  const loadList = useCallback(async (offset = 0) => {
    const page = await api.conversations(bot.id, { limit: PAGE, offset });
    setTotal(page.total);
    setList((prev) => (offset === 0 || !prev ? page.conversations : [...prev, ...page.conversations]));
  }, [bot.id]);

  const loadThread = useCallback(async (id: string) => {
    const t = await api.conversation(bot.id, id);
    setThread(t);
    // Opening marks it read on the server; mirror that locally.
    setList((prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, unread: false } : c)));
  }, [bot.id]);

  const refresh = async () => {
    setLoading(true);
    try { await loadList(0); if (openId) await loadThread(openId); } catch (e) { notify('err', (e as Error).message); } finally { setLoading(false); }
  };

  useEffect(() => { setList(null); setOpenId(null); setThread(null); refresh(); }, [bot.id]);

  // Live-ish: poll while the tab is open and the window is visible.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    return () => clearInterval(t);
  });

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [thread?.messages.length, openId]);

  const open = async (id: string) => {
    setOpenId(id); setThread(null); setReply('');
    try { await loadThread(id); } catch (e) { notify('err', (e as Error).message); }
  };

  const send = async () => {
    const text = reply.trim();
    if (!text || !openId || sending) return;
    setSending(true);
    try {
      const msg = await api.replyConversation(bot.id, openId, text);
      setReply('');
      setThread((t) => (t ? { ...t, messages: [...t.messages, msg] } : t));
      // Replying answers the visitor, so it no longer needs a person.
      setThread((t) => (t ? { ...t, conversation: { ...t.conversation, needsHuman: false } } : t));
      setList((prev) => (prev ?? []).map((c) => (c.id === openId ? { ...c, lastMessage: text, lastMessageAt: msg.createdAt, messageCount: c.messageCount + 1, needsHuman: false } : c)));
    } catch (e) { notify('err', (e as Error).message); } finally { setSending(false); }
  };

  const remove = async (id: string) => {
    const isTest = !!list?.find((c) => c.id === id && isTestConversation(c));
    if (!confirm(isTest ? 'Delete this test chat?' : 'Delete this conversation? The visitor keeps their copy until they close the tab.')) return;
    try {
      await api.deleteConversation(bot.id, id);
      setList((prev) => (prev ?? []).filter((c) => c.id !== id));
      setTotal((n) => Math.max(0, n - 1));
      if (openId === id) { setOpenId(null); setThread(null); }
    } catch (e) { notify('err', (e as Error).message); }
  };

  const kept = limits.conversationsKept;
  const waiting = (list ?? []).filter((c) => c.needsHuman).length;
  const shown = filter === 'human' ? (list ?? []).filter((c) => c.needsHuman) : (list ?? []);
  const testCount = (list ?? []).filter(isTestConversation).length;

  const removeTests = async () => {
    if (!confirm(`Delete all test chats from your preview? Real visitor conversations are kept.`)) return;
    try {
      const { deleted } = await api.deleteTestConversations(bot.id);
      if (openId && list?.find((c) => c.id === openId && isTestConversation(c))) { setOpenId(null); setThread(null); }
      await loadList(0);
      notify('ok', `Deleted ${deleted} test ${deleted === 1 ? 'chat' : 'chats'}.`);
    } catch (e) { notify('err', (e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Inbox"
        desc="Every chat visitors have with your bot on the live site. Reply here and it shows up in their chat window."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />} onClick={refresh} disabled={loading}>Refresh</Button>
            {testCount > 0 && <Button variant="ghost" icon={<FlaskConical className="w-4 h-4" />} onClick={removeTests}>Delete test chats</Button>}
          </div>
        }
      />

      {waiting > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><Hand className="w-4 h-4" /></span>
          <div className="flex-1 min-w-[12rem]">
            <div className="text-sm font-semibold text-amber-900">{waiting} {waiting === 1 ? 'visitor is' : 'visitors are'} waiting for a reply from you</div>
            <div className="text-xs text-amber-800/80">They wrote to the team or asked something your bot couldn't answer.</div>
          </div>
          {filter !== 'human' && <Button size="sm" variant="secondary" onClick={() => setFilter('human')}>Show them</Button>}
        </div>
      )}

      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <FlaskConical className="w-3.5 h-3.5 text-gold-600 shrink-0" />
        Try it now: chat in the preview on the right. It shows up here as a <strong className="text-slate-700">Test</strong> chat you can reply to and delete.
      </p>

      {list === null ? (
        <RowsSkeleton rows={5} />
      ) : list.length === 0 ? (
        <Card className="!p-0 overflow-hidden">
          <EmptyState icon={<Inbox className="w-6 h-6" />} title="No conversations yet" desc="When a visitor chats with your bot on your live site, the whole conversation appears here. Chats from your preview show up as test chats." />
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:h-[640px]">
            {/* Conversation list */}
            <div className={`border-slate-100 md:border-r flex flex-col min-h-0 ${openId ? 'hidden md:flex' : 'flex'}`}>
              <div className="px-3 py-2 border-b border-slate-100 text-xs text-slate-500 flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Filter conversations">
                  <button onClick={() => setFilter('all')} aria-pressed={filter === 'all'} className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>All <span className="tabular-nums">{total}</span></button>
                  <button onClick={() => setFilter('human')} aria-pressed={filter === 'human'} className={`px-2.5 py-1 rounded-md font-semibold transition-colors inline-flex items-center gap-1 ${filter === 'human' ? 'bg-white text-amber-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    Needs reply {waiting > 0 && <span className="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-amber-500 text-white text-[10px] leading-[1.1rem] tabular-nums">{waiting}</span>}
                  </button>
                </div>
                {kept !== null && <span className="hidden sm:inline" title={`Your ${planName} plan keeps the latest ${kept.toLocaleString('en-US')} per site`}>keeps latest {kept.toLocaleString('en-US')}</span>}
              </div>
              <ul className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                {shown.length === 0 && (
                  <li className="px-4 py-10 text-center text-sm text-slate-400">Nobody is waiting for a reply right now.</li>
                )}
                {shown.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => open(c.id)} className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-s-[3px] ${c.needsHuman ? 'border-amber-400' : 'border-transparent'} ${openId === c.id ? 'bg-brand-50/60' : c.needsHuman ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50'}`}>
                      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${c.unread ? 'bg-brand-600 dot-glow-green' : 'bg-transparent'}`} aria-label={c.unread ? 'Unread' : undefined} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`text-sm truncate inline-flex items-center gap-1.5 ${c.unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>
                            {isTestConversation(c) ? 'Your test chat' : `Visitor ${c.visitorId.slice(-4).toUpperCase()}`}
                            {isTestConversation(c) && <TestBadge />}
                            {c.needsHuman && <NeedsReplyBadge />}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(c.lastMessageAt)}</span>
                        </span>
                        <span className={`block text-xs truncate mt-0.5 ${c.unread ? 'text-slate-700' : 'text-slate-500'}`} dir="auto">{c.lastMessage || '…'}</span>
                        <span className="block text-[11px] text-slate-400 truncate mt-0.5">{c.pageUrl ? hostname(c.pageUrl) : isTestConversation(c) ? 'Dashboard preview' : ''} · {c.messageCount} {c.messageCount === 1 ? 'message' : 'messages'}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {list.length < total && (
                <div className="border-t border-slate-100 p-2 text-center">
                  <Button variant="ghost" size="sm" onClick={() => loadList(list.length).catch((e) => notify('err', (e as Error).message))}>Show more</Button>
                </div>
              )}
            </div>

            {/* Thread */}
            <div className={`flex flex-col min-h-0 ${openId ? 'flex' : 'hidden md:flex'}`}>
              {!openId ? (
                <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-8 text-center">Pick a conversation to read it and reply.</div>
              ) : !thread ? (
                <div className="p-5 space-y-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-10 w-3/4" /><Skeleton className="h-10 w-2/3 ml-auto" /><Skeleton className="h-10 w-3/4" /></div>
              ) : (
                <>
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                    <button onClick={() => { setOpenId(null); setThread(null); }} className="md:hidden p-1.5 -ml-1 rounded-md text-slate-500 hover:bg-slate-100" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 inline-flex items-center gap-1.5">
                        {isTestConversation(thread.conversation) ? 'Your test chat' : `Visitor ${thread.conversation.visitorId.slice(-4).toUpperCase()}`}
                        {isTestConversation(thread.conversation) && <TestBadge />}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Started {formatDateTime(thread.conversation.startedAt)}
                        {thread.conversation.pageUrl && <> · <a href={thread.conversation.pageUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 inline-flex items-center gap-0.5">{hostname(thread.conversation.pageUrl)} <ExternalLink className="w-3 h-3" /></a></>}
                      </div>
                    </div>
                    <IconButton label={isTestConversation(thread.conversation) ? 'Delete test chat' : 'Delete conversation'} variant="danger" onClick={() => remove(thread.conversation.id)}><Trash2 className="w-4 h-4" /></IconButton>
                  </div>

                  {thread.conversation.needsHuman && (
                    <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                      <Hand className="w-3.5 h-3.5 shrink-0" />
                      <span><strong className="font-semibold">Needs your reply.</strong> The highlighted messages are for a person, not the bot. Replying clears this.</span>
                    </div>
                  )}
                  <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-slate-50/60 min-h-[280px] max-h-[60vh] md:max-h-none">
                    {thread.messages.map((m) => <MessageBubble key={m.id} m={m} theme={bot.themeColor} />)}
                  </div>

                  <div className="border-t border-slate-100 p-3">
                    <div className="flex items-end gap-2">
                      <TextArea
                        rows={2}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Write a reply… it appears in the visitor's chat window while their tab is open."
                        dir="auto"
                        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); }}
                      />
                      <Button icon={<Send className="w-4 h-4" />} onClick={send} loading={sending} disabled={!reply.trim()}>Send</Button>
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-400">Ctrl+Enter to send · Visitors see replies for as long as their chat tab stays open.</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {kept !== null && (
        <p className="text-xs text-slate-400">
          Your {planName} plan keeps the latest {kept.toLocaleString('en-US')} conversations per site; older ones are removed as new ones arrive. <UpgradeLink className="text-xs">Upgrade for more</UpgradeLink>.
        </p>
      )}
    </div>
  );
}

function NeedsReplyBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-1.5 py-px text-[10px] font-semibold text-amber-800">
      <Hand className="w-2.5 h-2.5" /> Needs reply
    </span>
  );
}

function TestBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gold-50 border border-gold-200 px-1.5 py-px text-[10px] font-semibold text-gold-800">
      <FlaskConical className="w-2.5 h-2.5" /> Test
    </span>
  );
}

function MessageBubble({ m, theme }: { m: ChatMessage; theme: string }) {
  if (m.role === 'visitor') {
    return (
      <div className="flex items-end gap-2">
        <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0"><User className="w-3.5 h-3.5" /></span>
        <div className="max-w-[80%]">
          <div className={`rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm text-slate-800 whitespace-pre-wrap border ${m.toTeam ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-100' : 'bg-white border-slate-200'}`} dir="auto">{m.text}</div>
          <div className="text-[10px] text-slate-400 mt-1 ms-1 inline-flex items-center gap-1" title={formatDateTime(m.createdAt)}>
            Visitor · {timeAgo(m.createdAt)}
            {m.toTeam && <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700">· <Mail className="w-2.5 h-2.5" /> For the team</span>}
          </div>
        </div>
      </div>
    );
  }
  const owner = m.role === 'owner';
  return (
    <div className="flex items-end gap-2 justify-end">
      <div className="max-w-[80%] text-right">
        <div className={`inline-block text-left rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap ${owner ? 'text-white shadow-brand' : 'bg-slate-100 text-slate-600'}`} style={owner ? { background: theme } : undefined} dir="auto">{m.text}</div>
        <div className="text-[10px] text-slate-400 mt-1 me-1" title={formatDateTime(m.createdAt)}>{owner ? 'You' : 'Bot'} · {timeAgo(m.createdAt)}</div>
      </div>
      <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${owner ? 'ai-gradient text-white' : 'bg-slate-200 text-slate-500'}`}>{owner ? <Send className="w-3 h-3" /> : <BotIcon className="w-3.5 h-3.5" />}</span>
    </div>
  );
}

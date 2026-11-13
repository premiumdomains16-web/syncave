import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import { ChevronRight, Inbox, Mail, MessageSquare, PanelRightClose, RefreshCw, Send, ShoppingBag, Sparkles, X } from 'lucide-react';
import { rid, type Bot, type QA } from '@shared/types';
import { bestMatch } from '@/lib/matcher';
import { api } from '@/lib/api';

interface Message { role: 'user' | 'model' | 'owner'; content: string; }

const REPLY_DELAY_MS = 450;
const POLL_MS = 5_000;
/** Questions shown at once in the menu; "More questions" pages through the rest. Same as public/widget.js. */
const MENU_SIZE = 4;

/** Draft-mode stand-in for public/widget.js, so owners can test before publishing. */
export function PreviewPanel({ bot, dirty, onClose, onOpenInbox }: { bot: Bot; dirty: boolean; onClose: () => void; onOpenInbox?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [page, setPage] = useState(0);
  // Writing to the team: the next message is flagged "needs reply" in the Inbox.
  const [teamMode, setTeamMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Test conversation in the Inbox for this preview session (created on the first message).
  const convId = useRef<string | null>(null);
  const lastOwnerAt = useRef<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const reset = () => {
    clearTimeout(timer.current);
    setMessages([]); setAnswered(new Set()); setTyping(false); setPage(0); setTeamMode(false);
    convId.current = null; lastOwnerAt.current = undefined; setSaved(false);
  };

  /** Saves this exchange to the Inbox as a test chat. Never blocks or breaks the preview. */
  const logTest = (entries: { role: 'visitor' | 'bot'; text: string; toTeam?: boolean }[]) => {
    if (!convId.current) convId.current = 'c' + rid(11);
    api.logTestMessages(bot.id, convId.current, entries).then(() => setSaved(true)).catch((e) => console.warn('test chat not saved:', (e as Error).message));
  };

  // Replies sent from the Inbox to this test chat appear here, like they would for a visitor.
  useEffect(() => {
    const t = setInterval(() => {
      const cid = convId.current;
      if (!cid || document.visibilityState !== 'visible') return;
      api.testReplies(bot.id, cid, lastOwnerAt.current)
        .then(({ messages: replies }) => {
          if (!replies.length || convId.current !== cid) return;
          lastOwnerAt.current = replies[replies.length - 1].createdAt;
          setMessages((m) => [...m, ...replies.map((r) => ({ role: 'owner' as const, content: r.text }))]);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [bot.id]);

  // Each site gets a fresh conversation.
  useEffect(reset, [bot.id]);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, page]);

  const reply = (userText: string, answer: string, qaId?: string, log = true, toTeam = false) => {
    if (log) logTest([{ role: 'visitor', text: userText, ...(toTeam ? { toTeam: true } : {}) }, { role: 'bot', text: answer }]);
    setMessages((m) => [...m, { role: 'user', content: userText }]);
    setTyping(true);
    setPage(0);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { role: 'model', content: answer }]);
      if (qaId) setAnswered((s) => new Set(s).add(qaId));
    }, REPLY_DELAY_MS);
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (teamMode) {
      setTeamMode(false);
      reply(text, L.teamSent, undefined, true, true);
      return;
    }
    const match = bestMatch(text, bot.qa);
    // A typed message the bot can't answer goes to the team too, like in the live widget.
    if (match) reply(text, match.answer, match.id);
    else reply(text, `${bot.fallbackMessage}\n\n${L.teamForwarded}`, undefined, true, true);
  };

  const startTeamMessage = () => {
    setMessages((m) => [...m, { role: 'model', content: L.teamPrompt }]);
    setTeamMode(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const ask = (item: QA) => reply(item.question, item.answer, item.id);

  const remaining = bot.qa.filter((q) => q.question.trim() && !answered.has(q.id));
  const L = widgetLabels(bot);
  const showMenu = !typing && !teamMode;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 sm:px-5 h-14 sm:h-16 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 text-brand-600"><Sparkles className="w-3 h-3" />Live preview</div>
          <div className="text-sm font-medium flex items-center gap-1.5 truncate">
            {dirty ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" /><span className="text-amber-700 truncate">Draft, not published</span></>
            ) : bot.published ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" /><span className="text-green-700 truncate">Matches live version</span></>
            ) : (
              <span className="text-slate-500">Preview only</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <button onClick={reset} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Restart conversation" aria-label="Restart conversation">
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Close preview" aria-label="Close preview">
            <PanelRightClose className="w-4 h-4 hidden xl:block" />
            <X className="w-5 h-5 xl:hidden" />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-slate-100 p-3 sm:p-4 flex flex-col min-h-0">
        {/* The chat keeps a phone-like width and stays centered however wide the panel is. */}
        <div className="flex-1 w-full max-w-[440px] mx-auto bg-white rounded-3xl shadow-pop border border-slate-200/80 overflow-hidden flex flex-col min-h-0">
          <div className="px-4 py-3 flex items-center gap-2.5 text-white shrink-0" style={{ background: bot.themeColor }}>
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center overflow-hidden shrink-0">
              {bot.logoUrl ? <img src={bot.logoUrl} alt="" className="w-full h-full object-cover" /> : <MessageSquare className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" dir="auto">{bot.name}</div>
              <div className="text-[11px] opacity-90 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-300" /> {L.online}
              </div>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 bg-slate-50 custom-scrollbar bg-cover bg-center"
            style={bot.backgroundImageUrl ? { backgroundImage: `linear-gradient(rgba(245,248,248,.82), rgba(245,248,248,.82)), url(${bot.backgroundImageUrl})` } : undefined}
          >
            <Bubble role="model" content={bot.welcomeMessage} theme={bot.themeColor} />
            {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} theme={bot.themeColor} animate teamLabel={L.team} />)}
            {typing && (
              <div className="inline-flex gap-1 px-3 py-2.5 bg-white border border-slate-200 rounded-2xl rounded-tl-sm">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
            {showMenu && (
              <QuestionMenu
                items={remaining}
                page={page}
                onPage={setPage}
                onPick={ask}
                onTeam={startTeamMessage}
                theme={bot.themeColor}
                labels={L}
                onOrder={bot.enableOrders ? () => reply(L.order, '_In the live widget, an order form opens here (name, email, phone, message). Submissions appear in the **Orders** tab._', undefined, false) : undefined}
              />
            )}
          </div>

          {teamMode && (
            <div className="px-3.5 py-1.5 flex items-center justify-between gap-2 text-xs font-semibold border-t shrink-0" style={{ color: bot.themeColor, background: `${bot.themeColor}12`, borderColor: `${bot.themeColor}26` }} dir={L.dir}>
              <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{L.teamBar}</span>
              <button type="button" onClick={() => setTeamMode(false)} className="font-medium text-slate-500 underline underline-offset-2">{L.cancel}</button>
            </div>
          )}
          <form className="border-t border-slate-200 p-2 flex items-center gap-1 shrink-0 bg-white" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              ref={inputRef}
              type="text"
              placeholder={teamMode ? L.teamPlaceholder : L.placeholder}
              dir="auto"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2.5 bg-transparent outline-none text-sm placeholder:text-slate-400"
              aria-label="Test message"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-30 transition-opacity shrink-0"
              style={{ background: bot.themeColor }}
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
        <div className="pt-2.5 text-[11px] text-slate-500 flex items-center justify-center gap-1.5 text-center">
          <Inbox className="w-3.5 h-3.5 shrink-0" />
          {saved ? (
            <span>Saved to Inbox as a test chat{onOpenInbox && <> · <button onClick={onOpenInbox} className="font-semibold text-brand-600 hover:text-brand-700">open Inbox</button></>}</span>
          ) : (
            <span>Chats here are saved to your Inbox as test chats</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** A short menu of questions under the latest answer, paged with "More questions". */
function QuestionMenu({ items, page, onPage, onPick, onTeam, onOrder, theme, labels }: {
  items: QA[]; page: number; onPage: (p: number) => void; onPick: (q: QA) => void; onTeam: () => void; onOrder?: () => void; theme: string; labels: Labels;
}) {
  const pages = Math.ceil(items.length / MENU_SIZE);
  const current = Math.min(page, Math.max(pages - 1, 0));
  const slice = items.slice(current * MENU_SIZE, (current + 1) * MENU_SIZE);
  const last = current >= pages - 1;
  const left = items.length - (current + 1) * MENU_SIZE;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white border border-slate-200 p-2.5 space-y-1.5" dir={labels.dir}>
      {slice.length > 0 && <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{labels.menuTitle}</div>}
      {slice.map((q) => (
        <button
          key={q.id}
          onClick={() => onPick(q)}
          dir="auto"
          className="group w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-start text-[13px] font-medium text-slate-800 transition-colors hover:bg-slate-50"
          style={{ borderColor: `${theme}38` }}
        >
          <span className="leading-snug">{q.question}</span>
          <ChevronRight className="w-4 h-4 shrink-0 rtl:-scale-x-100 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" style={{ color: theme }} />
        </button>
      ))}
      <button
        onClick={onTeam}
        className="w-full flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-start text-[13px] font-semibold transition-colors"
        style={{ color: theme, borderColor: `${theme}73`, background: `${theme}12` }}
      >
        <Mail className="w-4 h-4 shrink-0" /> {labels.teamOption}
      </button>
      {(pages > 1 || onOrder) && (
        <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
          {pages > 1 ? (
            <button onClick={() => onPage(last ? 0 : current + 1)} className="px-1 py-1 text-xs font-semibold underline underline-offset-4" style={{ color: theme }}>
              {last ? labels.menuBack : `${labels.menuMore} (${left})`}
            </button>
          ) : <span />}
          {onOrder && (
            <button onClick={onOrder} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full text-white" style={{ background: theme }}>
              <ShoppingBag className="w-3 h-3" /> {labels.order}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

type Labels = ReturnType<typeof widgetLabels>;

/** Same language rule as public/widget.js: Arabic labels when most of the bot's text is Arabic. */
function widgetLabels(bot: Bot) {
  const sample = [bot.welcomeMessage, ...bot.qa.map((q) => q.question)].join(' ');
  const arabic = (sample.match(/[؀-ۿ]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  return arabic > latin
    ? { dir: 'rtl' as const, online: 'متصل الآن', order: 'اطلب الآن', placeholder: 'اكتب سؤالك...', team: 'رد من فريق الموقع', menuTitle: 'اختار سؤال', menuMore: 'أسئلة تانية', menuBack: 'ارجع لأول الأسئلة', teamOption: 'ابعت رسالة للفريق', teamPrompt: 'أكيد! اكتب رسالتك تحت، وحد من الفريق هيرد عليك هنا في نفس المحادثة.', teamPlaceholder: 'اكتب رسالتك للفريق...', teamBar: 'رسالة للفريق', cancel: 'إلغاء', teamSent: 'شكراً! رسالتك وصلت للفريق، وهيردوا عليك هنا في نفس المحادثة.', teamForwarded: 'بعت رسالتك للفريق، وهيردوا عليك هنا.' }
    : { dir: 'ltr' as const, online: 'Online', order: 'Place an order', placeholder: 'Type a question…', team: 'Reply from the team', menuTitle: 'Choose a question', menuMore: 'More questions', menuBack: 'Back to the first questions', teamOption: 'Message the team', teamPrompt: 'Sure! Write your message below and someone from the team will reply right here.', teamPlaceholder: 'Write your message to the team…', teamBar: 'Message to the team', cancel: 'Cancel', teamSent: "Thanks! Your message was sent to the team. They'll reply right here in this chat.", teamForwarded: "I've passed your message to the team, and they'll reply here." };
}

function Bubble({ role, content, theme, animate, teamLabel }: { role: Message['role']; content: string; theme: string; animate?: boolean; teamLabel?: string }) {
  const isUser = role === 'user';
  const isOwner = role === 'owner';
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        dir="auto"
        className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
          isUser ? 'rounded-tr-sm text-white whitespace-pre-wrap' : 'rounded-tl-sm bg-white text-slate-700 border border-slate-200 chat-md'
        }`}
        style={isUser ? { background: theme } : isOwner ? { borderColor: `${theme}66` } : undefined}
      >
        {isOwner && <div className="text-[10.5px] font-bold mb-1" style={{ color: theme }}>{teamLabel}</div>}
        {isUser ? content : (
          <Markdown components={{ a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" style={{ color: theme }} /> }}>
            {content}
          </Markdown>
        )}
      </div>
    </motion.div>
  );
}

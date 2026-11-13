// A small, self-playing chat window that shows what a template's bot says:
// the welcome message, then a customer question answered after a typing beat.
// Suggested questions below can be clicked to play more of the template's Q&A.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Send } from 'lucide-react';
import { TemplateIcon } from './TemplateIcon';

export interface PreviewQA { q: string; a: string }

interface Props {
  templateId: string;
  botName: string;
  welcome: string;
  qa: PreviewQA[];
  /** Header / visitor bubble color. Defaults to the brand teal. */
  color?: string;
  labels: { online: string; suggested: string; placeholder: string };
  /** Height of the message area. */
  height?: string;
  className?: string;
}

type Msg = { id: number; from: 'bot' | 'visitor'; text: string };

export function TemplateChatPreview({ templateId, botName, welcome, qa, color = 'var(--color-brand-600)', labels, height = 'h-[300px]', className = '' }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [asked, setAsked] = useState<Set<number>>(new Set());
  const timers = useRef<number[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  const ask = (i: number, delay = 0) => {
    const item = qa[i];
    if (!item) return;
    setAsked((s) => new Set(s).add(i));
    later(delay, () => {
      setMsgs((m) => [...m, { id: nextId.current++, from: 'visitor', text: item.q }]);
      later(350, () => setTyping(true));
      later(1300, () => {
        setTyping(false);
        setMsgs((m) => [...m, { id: nextId.current++, from: 'bot', text: item.a }]);
      });
    });
  };

  // Restart the conversation whenever the template (or language) changes.
  useEffect(() => {
    clearTimers();
    setTyping(false);
    setAsked(new Set());
    setMsgs([{ id: nextId.current++, from: 'bot', text: welcome }]);
    if (qa.length) ask(0, 700);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, welcome]);

  // Keep the newest message in view (scrolls the chat only, never the page).
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [msgs, typing]);

  const remaining = qa.map((x, i) => ({ ...x, i })).filter((x) => !asked.has(x.i)).slice(0, 3);

  return (
    <div className={`rounded-3xl bg-white shadow-[0_24px_60px_-24px_rgba(12,42,42,0.35)] border border-slate-200/70 overflow-hidden flex flex-col ${className}`}>
      <div className="px-4 py-3.5 flex items-center gap-3 text-white" style={{ background: color }}>
        <span className="w-9 h-9 rounded-full bg-white/20 ring-2 ring-white/20 flex items-center justify-center">
          <TemplateIcon id={templateId} className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{botName}</div>
          <div className="text-[11px] opacity-90 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-300" />{labels.online}</div>
        </div>
      </div>

      <div ref={scroller} className={`${height} overflow-y-auto custom-scrollbar p-4 space-y-2.5 bg-slate-50`} aria-live="polite">
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
              className={m.from === 'visitor' ? 'flex justify-end' : ''}
            >
              <div
                dir="auto"
                className={m.from === 'visitor'
                  ? 'max-w-[85%] rounded-2xl rounded-se-sm px-3.5 py-2 text-sm text-white'
                  : 'max-w-[88%] w-fit rounded-2xl rounded-ss-sm bg-white border border-slate-200/80 shadow-card px-3.5 py-2 text-sm text-slate-700 leading-relaxed'}
                style={m.from === 'visitor' ? { background: color } : undefined}
              >
                {m.text}
              </div>
            </motion.div>
          ))}
          {typing && (
            <motion.div key="typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="inline-flex gap-1 px-3.5 py-3 bg-white border border-slate-200/80 rounded-2xl rounded-ss-sm shadow-card">
              {[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {remaining.length > 0 && (
        <div className="px-3 pt-2.5 pb-1 bg-white border-t border-slate-100">
          <div className="text-[11px] font-medium text-slate-400 mb-1.5 px-1">{labels.suggested}</div>
          <div className="flex flex-wrap gap-1.5">
            {remaining.map((x) => (
              <button
                key={x.i}
                type="button"
                onClick={() => ask(x.i)}
                disabled={typing}
                dir="auto"
                className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition-colors"
              >
                {x.q}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="p-2.5 flex items-center gap-2 bg-white">
        <div className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-400">{labels.placeholder}</div>
        <div className="w-9 h-9 rounded-full text-white flex items-center justify-center" style={{ background: color }}><Send className="w-4 h-4 rtl:-scale-x-100" /></div>
      </div>
    </div>
  );
}

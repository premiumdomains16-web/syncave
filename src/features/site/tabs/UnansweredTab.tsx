import { useEffect, useState } from 'react';
import { Check, Lightbulb, MessageCircleQuestion, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { rid, type Bot, type BotPatch, type Unanswered } from '@shared/types';
import { api } from '@/lib/api';
import { bestMatch } from '@/lib/matcher';
import { timeAgo } from '@/lib/format';
import { Button, Card, EmptyState, IconButton, SectionHeader, TextArea } from '@/components/ui';
import { RowsSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { PlanNotice, usePlan } from '@/components/PlanLock';

interface Props {
  bot: Bot;
  onUpdate: (patch: BotPatch) => void;
  /** Keeps the tab badge / overview in sync with what this tab knows. */
  onCount: (n: number) => void;
}

/** Questions visitors typed that hit the fallback, with one-click promotion to Q&A. */
export function UnansweredTab({ bot, onUpdate, onCount }: Props) {
  const notify = useToast();
  const { plan, limits, name: planName } = usePlan();
  const [items, setItems] = useState<Unanswered[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');

  const setList = (next: Unanswered[]) => { setItems(next); onCount(next.length); };

  const refresh = async () => {
    setLoading(true);
    try { setList(await api.unanswered(bot.id)); } catch (e) { notify('err', (e as Error).message); } finally { setLoading(false); }
  };
  // Fresh on every visit — entries arrive from the live widget.
  useEffect(() => { setItems(null); refresh(); }, [bot.id]);

  const total = (items ?? []).reduce((n, u) => n + u.count, 0);
  const max = limits.questionsPerSite;
  const atLimit = max !== null && bot.qa.length >= max;

  const startAnswer = (u: Unanswered) => {
    if (atLimit) return;
    setAnswering(u.id);
    const near = bestMatch(u.question, bot.qa);
    setAnswer(near ? near.answer : '');
  };

  const save = async (u: Unanswered) => {
    const text = answer.trim();
    if (!text || !items) return;
    onUpdate({ qa: [...bot.qa, { id: rid(6), question: u.question, answer: text }] });
    setAnswering(null); setAnswer('');
    setList(items.filter((x) => x.id !== u.id));
    try { await api.dismissUnanswered(bot.id, u.id); } catch { /* the Q&A was added either way */ }
    notify('ok', 'Added to Q&A as a draft — publish to make it live.');
  };

  const dismiss = async (u: Unanswered) => {
    if (!items) return;
    setList(items.filter((x) => x.id !== u.id));
    try { await api.dismissUnanswered(bot.id, u.id); } catch (e) { notify('err', (e as Error).message); refresh(); }
  };

  const clearAll = async () => {
    if (!confirm('Clear the whole list? New unanswered questions will keep being collected.')) return;
    setList([]);
    try { await api.clearUnanswered(bot.id); } catch (e) { notify('err', (e as Error).message); refresh(); }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <SectionHeader
        title="Unanswered questions"
        desc="What visitors typed on your live site that didn't match any of your Q&A. Turn the frequent ones into answers."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />} onClick={refresh} disabled={loading}>Refresh</Button>
            {!!items?.length && <Button variant="ghost" icon={<Trash2 className="w-4 h-4" />} onClick={clearAll}>Clear all</Button>}
          </div>
        }
      />

      {!bot.published && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Questions are collected from the published widget on your website. Publish and embed it first.
        </p>
      )}

      {atLimit && (
        <PlanNotice plan={plan} need={(l) => l.questionsPerSite === null || (max !== null && l.questionsPerSite > max)} title={`Your ${planName} plan is at its ${max}-question limit.`}>
          Delete a question to make room, or upgrade to turn these into answers.
        </PlanNotice>
      )}

      {items === null ? (
        <RowsSkeleton rows={4} />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {items.length === 0 ? (
            <EmptyState
              icon={<MessageCircleQuestion className="w-6 h-6" />}
              title="Nothing unanswered yet"
              desc="When a visitor types something your bot can't answer, it shows up here so you can add the answer."
            />
          ) : (
            <>
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span><strong className="text-slate-900 font-semibold">{items.length}</strong> distinct {items.length === 1 ? 'question' : 'questions'} · asked {total} {total === 1 ? 'time' : 'times'}</span>
                <span className="hidden sm:inline">Sorted by how often they're asked</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((u) => {
                  const open = answering === u.id;
                  const near = open ? null : bestMatch(u.question, bot.qa);
                  return (
                    <li key={u.id} className={open ? 'bg-brand-50/30' : ''}>
                      <div className="px-5 py-3 flex items-start gap-3">
                        <span className={`mt-0.5 shrink-0 min-w-[2rem] h-6 px-1.5 rounded-full text-[11px] font-semibold tabular-nums flex items-center justify-center ${u.count >= 3 ? 'ai-gradient text-white shadow-brand' : 'bg-slate-100 text-slate-600'}`} title={`Asked ${u.count} ${u.count === 1 ? 'time' : 'times'}`}>
                          ×{u.count}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900 break-words text-left" dir="auto">{u.question}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Last asked {timeAgo(u.lastSeen)}
                            {near && <> · closest existing answer: <span className="text-slate-700" dir="auto">“{near.question}”</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!open && (
                            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => startAnswer(u)} disabled={atLimit} title={atLimit ? 'Question limit reached' : 'Write an answer and add it to your Q&A'}>
                              <span className="hidden sm:inline">Add as Q&A</span><span className="sm:hidden">Add</span>
                            </Button>
                          )}
                          <IconButton label="Dismiss" variant="danger" onClick={() => dismiss(u)}><X className="w-3.5 h-3.5" /></IconButton>
                        </div>
                      </div>
                      {open && (
                        <div className="px-5 pb-4 sm:pl-16 space-y-2 max-w-3xl animate-fade-up">
                          <TextArea
                            autoFocus
                            rows={3}
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder="Write the answer visitors should get."
                            dir="auto"
                            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(u); if (e.key === 'Escape') setAnswering(null); }}
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={() => save(u)} disabled={!answer.trim()}>Add to Q&A</Button>
                            <Button size="sm" variant="ghost" onClick={() => setAnswering(null)}>Cancel</Button>
                            <span className="text-[11px] text-slate-400 ms-auto hidden sm:inline">Ctrl+Enter to save</span>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      )}

      <p className="text-xs text-slate-400">
        Only the typed text is stored — no names, emails or IP addresses. Similar spellings are grouped together.
      </p>
    </div>
  );
}

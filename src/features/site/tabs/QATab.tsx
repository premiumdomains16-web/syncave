import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, CircleAlert, HelpCircle, Plus, Search, Trash2 } from 'lucide-react';
import { rid, type Bot, type BotPatch, type QA } from '@shared/types';
import { Button, Card, EmptyState, Field, IconButton, SectionHeader, TextArea, TextInput } from '@/components/ui';
import { PlanNotice, UsageMeter, usePlan } from '@/components/PlanLock';

interface Props { bot: Bot; onUpdate: (patch: BotPatch) => void; }

export function QATab({ bot, onUpdate }: Props) {
  const { plan, limits, name: planName } = usePlan();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const qa = bot.qa;

  const max = limits.questionsPerSite;
  const atLimit = max !== null && qa.length >= max;
  const overLimit = max !== null && qa.length > max;

  const setQA = (next: QA[]) => onUpdate({ qa: next });
  const updateItem = (id: string, patch: Partial<QA>) => setQA(qa.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const remove = (id: string) => setQA(qa.filter((q) => q.id !== id));
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= qa.length) return;
    const next = [...qa];
    [next[index], next[j]] = [next[j], next[index]];
    setQA(next);
  };
  const add = () => {
    if (atLimit) return;
    const item: QA = { id: rid(6), question: '', answer: '' };
    setQA([...qa, item]);
    setSearch('');
    setOpenId(item.id);
  };

  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    for (const q of qa) {
      const k = q.question.trim().toLowerCase();
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [qa]);

  const term = search.trim().toLowerCase();
  const rows = qa
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !term || item.question.toLowerCase().includes(term) || item.answer.toLowerCase().includes(term));

  const incomplete = qa.filter((q) => !q.question.trim() || !q.answer.trim()).length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Questions & Answers"
        desc={<>Edits save as a draft automatically. Click <strong className="text-slate-700">Publish</strong> to push them live. Order matters — questions appear as suggestion chips in this order.</>}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <TextInput placeholder="Search questions and answers…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {max !== null && (
          <div className="w-40 hidden sm:block">
            <UsageMeter used={qa.length} limit={max} label="Questions" />
          </div>
        )}
        <Button icon={<Plus className="w-4 h-4" />} onClick={add} disabled={atLimit} title={atLimit ? `Your ${planName} plan includes up to ${max} questions per site` : undefined}>
          Add question
        </Button>
      </div>

      {atLimit && (
        <PlanNotice
          plan={plan}
          need={(l) => l.questionsPerSite === null || (max !== null && l.questionsPerSite > max)}
          title={overLimit ? `This site has ${qa.length} questions — your ${planName} plan allows ${max}.` : `You've used all ${max} questions on the ${planName} plan.`}
        >
          {overLimit
            ? 'Remove some questions to publish again, or upgrade to keep them all.'
            : 'Upgrade for unlimited questions per site, or delete one to make room.'}
        </PlanNotice>
      )}

      {incomplete > 0 && (
        <p className="text-xs text-amber-700 flex items-center gap-1.5">
          <CircleAlert className="w-3.5 h-3.5" />
          {incomplete} {incomplete === 1 ? 'question is' : 'questions are'} missing a question or answer — they won't help visitors until completed.
        </p>
      )}

      <Card className="!p-0 overflow-hidden">
        {qa.length === 0 ? (
          <EmptyState
            icon={<HelpCircle className="w-6 h-6" />}
            title="No questions yet"
            desc="Add the questions your visitors ask most, with the answers you want the bot to give."
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={add}>Add your first question</Button>}
          />
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">No questions match “{search}”.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ item, index }) => {
              const open = openId === item.id;
              const dup = duplicates.has(item.question.trim().toLowerCase());
              const missing = !item.question.trim() || !item.answer.trim();
              return (
                <li key={item.id} className={open ? 'bg-brand-50/30' : ''}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : item.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), setOpenId(open ? null : item.id))}
                    className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:bg-slate-50"
                  >
                    <span className="w-6 text-xs font-mono text-slate-400 shrink-0">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm ${item.question ? 'font-medium text-slate-900' : 'italic text-slate-400'}`} dir="auto">
                          {item.question || 'Untitled question'}
                        </span>
                        {missing && <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">Incomplete</span>}
                        {dup && <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded shrink-0">Duplicate</span>}
                      </div>
                      {!open && (
                        <div className="text-xs text-slate-500 truncate mt-0.5" dir="auto">
                          {item.answer || <span className="italic text-slate-400">No answer yet</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {!term && (
                        <span className="hidden sm:flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <IconButton label="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="w-3.5 h-3.5" /></IconButton>
                          <IconButton label="Move down" disabled={index === qa.length - 1} onClick={() => move(index, 1)}><ArrowDown className="w-3.5 h-3.5" /></IconButton>
                        </span>
                      )}
                      <IconButton label="Delete question" variant="danger" onClick={() => remove(item.id)}><Trash2 className="w-3.5 h-3.5" /></IconButton>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ml-1 ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </div>

                  {open && (
                    <div className="px-4 sm:pl-13 pb-4 pt-1 space-y-3 max-w-3xl">
                      <Field label="Question" htmlFor={`q-${item.id}`}>
                        <TextInput
                          id={`q-${item.id}`}
                          value={item.question}
                          onChange={(e) => updateItem(item.id, { question: e.target.value })}
                          placeholder="e.g. What are your business hours?"
                          autoFocus={!item.question}
                          dir="auto"
                        />
                      </Field>
                      <Field label="Answer" hint="(Markdown: **bold**, *italic*, [link](https://…))" htmlFor={`a-${item.id}`}>
                        <TextArea
                          id={`a-${item.id}`}
                          value={item.answer}
                          onChange={(e) => updateItem(item.id, { answer: e.target.value })}
                          placeholder="Write the answer visitors will see."
                          rows={4}
                          dir="auto"
                        />
                      </Field>
                      {dup && <p className="text-xs text-red-600">Another question has the same wording — visitors will only ever get one of the answers.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {qa.length > 0 && (
        <p className="text-xs text-slate-400">
          Tip: the bot matches typed questions by keywords, not meaning. Add separate entries for common phrasings
          (“opening hours”, “when are you open”) and test them in the preview.
        </p>
      )}
    </div>
  );
}

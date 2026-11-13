import { useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Hand, ChevronRight, CircleAlert, Globe, HelpCircle, Inbox, Mail, MessageCircleQuestion, MonitorSmartphone, Plus, Rocket, Search, Shield, Sparkles, X } from 'lucide-react';
import { hasUnpublishedChanges, type Bot } from '@shared/types';
import type { Route } from '@/hooks/useRoute';
import { hostname, timeAgo } from '@/lib/format';
import { useAuth } from '@/auth';
import { Badge, Button, Card, PageBody, TextInput } from '@/components/ui';
import { VerifiedBadge } from '@/components/StatusBadges';
import { UpgradeLink, UsageMeter, usePlan } from '@/components/PlanLock';
import { formatLimit, publishBlockers } from '@shared/plans';

const TODO_LIMIT = 4;

interface Props {
  bots: Bot[];
  onNavigate: (r: Route) => void;
  onAddSite: () => void;
  /** A site previewed in the simulator before signing up — offered, never forced. */
  suggestedUrl?: string;
  onAddSuggested?: () => void;
  onDismissSuggested?: () => void;
}

type Todo = { bot: Bot; text: string; short: string; icon: ReactNode; tone: string; route: Route };

export function OverviewPage({ bots, onNavigate, onAddSite, suggestedUrl, onAddSuggested, onDismissSuggested }: Props) {
  const { user } = useAuth();
  const { plan, limits, name: planName } = usePlan();
  const [search, setSearch] = useState('');
  const [showAllTodo, setShowAllTodo] = useState(false);
  const totalQA = bots.reduce((n, b) => n + b.qa.length, 0);
  const totalOrders = bots.reduce((n, b) => n + b.orderCount, 0);
  const live = bots.filter((b) => b.published).length;
  const verified = bots.filter((b) => b.verified).length;

  // Next action per site, most blocking first.
  const todo = bots.flatMap((b): Todo[] => {
    if (publishBlockers(plan, b).length) return [{ bot: b, text: `Over the ${planName} plan limits — fix or upgrade to publish`, short: 'Over plan limits', icon: <Sparkles className="w-4 h-4" />, tone: 'bg-brand-50 text-brand-600 border-brand-100', route: { view: 'site', botId: b.id, tab: 'qa' } }];
    if (!b.verified) return [{ bot: b, text: 'Verify domain ownership', short: 'Verify', icon: <Shield className="w-4 h-4" />, tone: 'bg-amber-50 text-amber-600 border-amber-100', route: { view: 'site', botId: b.id, tab: 'verify' } }];
    if (!b.published) return [{ bot: b, text: 'Publish your first version', short: 'Publish', icon: <Rocket className="w-4 h-4" />, tone: 'bg-brand-50 text-brand-600 border-brand-100', route: { view: 'site', botId: b.id, tab: 'embed' } }];
    if (hasUnpublishedChanges(b)) return [{ bot: b, text: 'Publish your latest changes', short: 'Publish changes', icon: <CircleAlert className="w-4 h-4" />, tone: 'bg-amber-50 text-amber-600 border-amber-100', route: { view: 'site', botId: b.id } }];
    if (b.needsHumanCount > 0) return [{ bot: b, text: `${b.needsHumanCount} ${b.needsHumanCount === 1 ? 'visitor is' : 'visitors are'} waiting for your reply`, short: `${b.needsHumanCount} need reply`, icon: <Hand className="w-4 h-4" />, tone: 'bg-amber-50 text-amber-700 border-amber-200', route: { view: 'site', botId: b.id, tab: 'inbox' } }];
    if (b.unreadCount > 0) return [{ bot: b, text: `${b.unreadCount} unread ${b.unreadCount === 1 ? 'conversation' : 'conversations'} waiting for a reply`, short: `${b.unreadCount} unread`, icon: <Inbox className="w-4 h-4" />, tone: 'bg-brand-50 text-brand-600 border-brand-100', route: { view: 'site', botId: b.id, tab: 'inbox' } }];
    if (b.unansweredCount >= 3) return [{ bot: b, text: `${b.unansweredCount} questions your bot couldn't answer`, short: `${b.unansweredCount} unanswered`, icon: <MessageCircleQuestion className="w-4 h-4" />, tone: 'bg-gold-50 text-gold-700 border-gold-100', route: { view: 'site', botId: b.id, tab: 'unanswered' } }];
    return [];
  });

  const q = search.trim().toLowerCase();
  const shown = q ? bots.filter((b) => b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) : bots;

  return (
    <PageBody>
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap animate-fade-up">
        <div>
          <h1 className="text-2xl sm:text-[1.75rem] font-bold text-brand-950 tracking-tight">Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Your chatbots at a glance and what needs your attention.</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={onAddSite}>Add site</Button>
      </div>

      {suggestedUrl && (
        <div className="mb-6 rounded-3xl bg-white shadow-card p-4 flex items-center gap-3 flex-wrap animate-fade-up">
          <span className="w-9 h-9 rounded-xl bg-white border border-gold-200 text-gold-600 flex items-center justify-center shrink-0"><MonitorSmartphone className="w-4 h-4" /></span>
          <div className="flex-1 min-w-[12rem]">
            <div className="text-sm font-semibold text-slate-900">Continue with {hostname(suggestedUrl)}?</div>
            <div className="text-xs text-slate-600">You previewed the chat on this site. Add it to pick a template and start writing answers.</div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={onAddSuggested}>Add this site</Button>
            <button onClick={onDismissSuggested} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      <AssistantBanner name={user?.name} bots={bots} live={live} todo={todo} onNavigate={onNavigate} onAddSite={onAddSite} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat icon={<Globe className="w-4 h-4" />} label="Sites" value={bots.length} sub={`${verified} verified`} delay={1} />
        <Stat icon={<Rocket className="w-4 h-4" />} label="Live" value={live} sub={bots.length ? `of ${bots.length} sites` : '—'} tone={live > 0 ? 'green' : undefined} delay={2} />
        <Stat icon={<HelpCircle className="w-4 h-4" />} label="Q&A pairs" value={totalQA} sub="across all sites" delay={3} />
        <Stat icon={<Mail className="w-4 h-4" />} label="Orders" value={totalOrders} sub="received" delay={4} />
      </div>

      <Card className="mb-6 animate-fade-up [animation-delay:160ms]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
              Plan usage
              <span className="rounded-full ai-gradient text-white px-2 py-0.5 text-[11px] font-semibold">{planName}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">What your plan stores. Limits apply per website.</p>
          </div>
          <UpgradeLink className="text-xs">{planName === 'Agency' ? 'See plans' : 'Upgrade'}</UpgradeLink>
        </div>
        <div className="mt-4 grid sm:grid-cols-3 gap-5">
          <UsageMeter used={bots.length} limit={limits.sites} label="Websites" />
          <UsageMeter used={bots.reduce((m, b) => Math.max(m, b.qa.length), 0)} limit={limits.questionsPerSite} label="Questions (largest site)" />
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-slate-600">Orders stored per site</span>
              <span className="tabular-nums text-slate-500">{limits.orders ? formatLimit(limits.ordersKept) : 'Not included'}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${limits.orders ? 'ai-gradient opacity-35' : 'bg-slate-200'}`} style={{ width: limits.orders ? '100%' : '0%' }} />
            </div>
          </div>
        </div>
      </Card>

      {todo.length > 0 && (
        <Card title="Needs attention" desc="Finish these to get every chatbot live." className="mb-6 animate-fade-up [animation-delay:200ms]">
          <ul className="divide-y divide-slate-100 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 border-t border-slate-100">
            {(showAllTodo ? todo : todo.slice(0, TODO_LIMIT)).map(({ bot, text, icon, tone, route }) => (
              <li key={bot.id}>
                <button onClick={() => onNavigate(route)} className="group w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors">
                  <span className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center ${tone}`}>{icon}</span>
                  <span className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="text-sm text-slate-900 font-medium">{text}</span>
                    <span className="text-xs text-slate-500 truncate" dir="auto">{bot.name}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 transition-[color,transform] group-hover:text-brand-600 group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
            {todo.length > TODO_LIMIT && (
              <li>
                <button onClick={() => setShowAllTodo((v) => !v)} className="w-full px-5 py-2.5 text-xs font-semibold text-brand-600 hover:bg-slate-50 text-left">
                  {showAllTodo ? 'Show less' : `Show ${todo.length - TODO_LIMIT} more`}
                </button>
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden mb-6 animate-fade-up [animation-delay:260ms]">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Your sites</h2>
          {bots.length > 4 && (
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sites" className="pl-8 py-1.5 text-xs" />
            </div>
          )}
        </div>
        {bots.length === 0 ? (
          <div className="px-6 py-10">
            <div className="max-w-xl mx-auto text-center">
              <div className="relative w-14 h-14 mx-auto mb-4">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-100 to-gold-50 rotate-6" aria-hidden />
                <div className="relative w-14 h-14 rounded-2xl bg-white border border-slate-200 text-brand-600 flex items-center justify-center shadow-card"><Globe className="w-6 h-6" /></div>
              </div>
              <h3 className="text-base font-semibold text-slate-900">Add your first website</h3>
              <p className="text-sm text-slate-500 mt-1">Three steps from here to a live chat on your site. Takes about ten minutes.</p>
              <ol className="mt-6 grid sm:grid-cols-3 gap-3 text-left">
                {[
                  ['Add the site', 'Enter your address and pick an industry template with ready questions.'],
                  ['Write answers', 'Edit the questions in your words and test them in the live preview.'],
                  ['Verify & publish', 'Paste one tag to prove the domain is yours, then publish and embed.'],
                ].map(([t, d], i) => (
                  <li key={t} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                    <span className="w-6 h-6 rounded-full ai-gradient text-white text-xs font-bold flex items-center justify-center mb-2">{i + 1}</span>
                    <div className="text-sm font-semibold text-slate-900">{t}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{d}</div>
                  </li>
                ))}
              </ol>
              <Button className="mt-6" size="lg" icon={<Plus className="w-4 h-4" />} onClick={onAddSite}>Add website</Button>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">No sites match “{search}”.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((b) => {
              const draft = hasUnpublishedChanges(b);
              return (
                <li key={b.id}>
                  <button onClick={() => onNavigate({ view: 'site', botId: b.id })} className="group w-full px-5 py-3 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-semibold shrink-0 overflow-hidden shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]"
                      style={{ background: b.themeColor }}
                    >
                      {b.logoUrl ? <img src={b.logoUrl} alt="" className="w-full h-full object-cover" /> : hostname(b.url).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-slate-900 truncate" dir="auto">{b.name}</div>
                      <div className="text-xs text-slate-500 truncate">{hostname(b.url)}</div>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5">
                      <VerifiedBadge verified={b.verified} />
                      {b.published && !draft && <Badge tone="green">Live</Badge>}
                      {draft && <Badge tone="amber">Draft</Badge>}
                    </div>
                    <div className="hidden lg:block w-20 text-xs text-slate-500 text-right tabular-nums">{b.qa.length} Q&A</div>
                    <div className="hidden lg:block w-28 text-xs text-slate-500 text-right">{b.published ? `Published ${timeAgo(b.lastPublished)}` : 'Never published'}</div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 transition-[color,transform] group-hover:text-slate-500 group-hover:translate-x-0.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4 animate-fade-up [animation-delay:320ms]">
        <QuickLink icon={<Rocket className="w-5 h-5" />} title="How it works" desc="Add a site, write Q&A, verify your domain, publish, and paste one line of code." cta="Read the guide" onClick={() => onNavigate({ view: 'docs' })} />
        <QuickLink icon={<BookOpen className="w-5 h-5" />} title="Get help" desc="Answers to common questions and troubleshooting tips." cta="Open help" onClick={() => onNavigate({ view: 'help' })} />
      </div>
    </PageBody>
  );
}

/** Dark "assistant" card: a one-line read of the account's state plus the next actions as chips. */
function AssistantBanner({ name, bots, live, todo, onNavigate, onAddSite }: {
  name?: string; bots: Bot[]; live: number; todo: Todo[]; onNavigate: (r: Route) => void; onAddSite: () => void;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = (name ?? '').trim().split(/\s+/)[0];
  const drafts = bots.filter((b) => b.published && hasUnpublishedChanges(b)).length;
  const unanswered = bots.reduce((n, b) => n + b.unansweredCount, 0);
  const unread = bots.reduce((n, b) => n + b.unreadCount, 0);
  const waiting = bots.reduce((n, b) => n + b.needsHumanCount, 0);

  let summary: string;
  if (bots.length === 0) summary = 'Add your first website and we’ll prefill a ready-to-edit Q&A from an industry template.';
  else if (todo.length === 0) summary = `All ${bots.length === 1 ? 'set — your site is' : `${bots.length} sites are`} live and up to date. Nothing needs your attention right now.`;
  else {
    const parts: string[] = [];
    parts.push(`${live} of ${bots.length} ${bots.length === 1 ? 'site is' : 'sites are'} live`);
    const unverified = bots.filter((b) => !b.verified).length;
    if (unverified) parts.push(`${unverified} still ${unverified === 1 ? 'needs' : 'need'} domain verification`);
    if (drafts) parts.push(`${drafts} ${drafts === 1 ? 'has' : 'have'} unpublished changes`);
    if (waiting) parts.push(`${waiting} ${waiting === 1 ? 'visitor is' : 'visitors are'} waiting for your reply`);
    if (unread) parts.push(`${unread} unread ${unread === 1 ? 'conversation' : 'conversations'}`);
    if (unanswered) parts.push(`${unanswered} visitor ${unanswered === 1 ? 'question' : 'questions'} still unanswered`);
    summary = parts.join(' · ') + '.';
  }

  return (
    <div className="relative mb-6 rounded-3xl animate-fade-up [animation-delay:60ms] shadow-[0_24px_50px_-24px_color-mix(in_srgb,var(--color-brand-600)_70%,transparent)]">
      <div className="relative overflow-hidden rounded-3xl surface-royal text-white px-5 py-5 sm:px-7 sm:py-6">
        <div aria-hidden className="absolute -top-16 -end-10 w-56 h-56 rounded-full border-[28px] border-white/10" />
        <div aria-hidden className="absolute inset-0 bg-dots-light opacity-50 [mask-image:radial-gradient(ellipse_at_left,black,transparent_70%)]" />
        <div className="relative flex items-start gap-4">
          <span className="relative shrink-0 w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center ring-1 ring-white/25">
            <Sparkles className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Assistant summary</div>
            <h2 className="mt-1 text-lg sm:text-xl font-semibold tracking-tight" dir="auto">{greeting}{first ? `, ${first}` : ''}.</h2>
            <p className="mt-1 text-sm text-white/80 leading-relaxed max-w-2xl">{summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {bots.length === 0 && (
                <Chip onClick={onAddSite} primary><Plus className="w-3.5 h-3.5" /> Add your first site</Chip>
              )}
              {todo.slice(0, 3).map((t) => (
                <Chip key={t.bot.id} onClick={() => onNavigate(t.route)}>
                  <span className="text-white/80">{t.icon}</span>
                  <span>{t.short}</span>
                  <span className="text-white/65 truncate max-w-[10rem]" dir="auto">· {t.bot.name}</span>
                </Chip>
              ))}
              {todo.length > 3 && <span className="self-center text-xs text-white/65">+{todo.length - 3} more below</span>}
              {bots.length > 0 && todo.length === 0 && (
                <Chip onClick={onAddSite}><Plus className="w-3.5 h-3.5" /> Add another site</Chip>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children, onClick, primary }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,transform] active:scale-[0.98] ${
        primary ? 'bg-white text-brand-700 hover:bg-brand-50' : 'bg-white/15 hover:bg-white/25 text-white'
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ icon, label, value, sub, tone, delay }: { icon: ReactNode; label: string; value: number; sub: string; tone?: 'green'; delay: number }) {
  return (
    <div className="group relative bg-white rounded-3xl p-5 shadow-card hover:shadow-card-hover transition-shadow animate-fade-up overflow-hidden" style={{ animationDelay: `${delay * 50}ms` }}>
      <div className="relative flex items-center justify-between">
        <span className={`w-10 h-10 rounded-full flex items-center justify-center ${tone === 'green' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>{icon}</span>
      </div>
      <div className="relative mt-4 text-sm font-medium text-slate-500">{label}</div>
      <div className={`relative mt-1 text-[1.75rem] leading-none font-bold tabular-nums tracking-tight ${tone === 'green' ? 'text-green-700' : 'text-slate-900'}`}>{value}</div>
      <div className="relative text-xs text-slate-500 mt-1.5">{sub}</div>
    </div>
  );
}

function QuickLink({ icon, title, desc, cta, onClick }: { icon: ReactNode; title: string; desc: string; cta: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group relative text-left bg-white rounded-3xl p-6 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-[box-shadow,transform] duration-200 overflow-hidden">
      <div className="relative">
        <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mb-3">{icon}</div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-1 mb-3 leading-relaxed">{desc}</p>
        <span className="text-xs font-semibold text-brand-600 inline-flex items-center gap-1 group-hover:gap-2 transition-[gap]">{cta} <ArrowRight className="w-3 h-3" /></span>
      </div>
    </button>
  );
}

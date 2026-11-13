import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, MonitorSmartphone, Code, ExternalLink, Globe, HelpCircle, Inbox, Loader2, Mail, MessageCircleQuestion, MessageSquare, PanelRightOpen, Palette, Rocket, RotateCcw, Shield, Trash2 } from 'lucide-react';
import { hasUnpublishedChanges, type Bot } from '@shared/types';
import type { BotsApi, SaveState } from '@/hooks/useBots';
import type { SiteTab } from '@/hooks/useRoute';
import { Button, IconButton } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { PublishStatus, VerifiedBadge } from '@/components/StatusBadges';
import { PreviewPanel } from '@/features/preview/PreviewPanel';
import { openPage } from '@/lib/native';
import { hostname } from '@/lib/format';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { QATab } from './tabs/QATab';
import { AppearanceTab } from './tabs/AppearanceTab';
import { EmbedTab } from './tabs/EmbedTab';
import { OrdersTab } from './tabs/OrdersTab';
import { VerifyTab } from './tabs/VerifyTab';
import { UnansweredTab } from './tabs/UnansweredTab';
import { InboxTab } from './tabs/InboxTab';

interface Props {
  bot: Bot;
  botsApi: BotsApi;
  tab?: SiteTab;
  onTabChange: (tab: SiteTab, replace?: boolean) => void;
  onBack: () => void;
  onDeleted: () => void;
}

export function SiteView({ bot, botsApi, tab: requestedTab, onTabChange, onBack, onDeleted }: Props) {
  const notify = useToast();
  // Dock the preview beside the editor only when both fit comfortably; otherwise it slides over.
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const [previewOpen, setPreviewOpen] = useState(() => window.innerWidth >= 1280);
  const tabsRef = useRef<HTMLElement>(null);
  const [publishing, setPublishing] = useState(false);
  const dirty = hasUnpublishedChanges(bot);

  // Default tab: unverified sites start on Verify, everything else on Q&A.
  const tab: SiteTab = requestedTab && (requestedTab !== 'orders' || bot.enableOrders)
    ? requestedTab
    : bot.verified ? 'qa' : 'verify';

  const update = (patch: Parameters<BotsApi['update']>[1]) => botsApi.update(bot.id, patch);

  const publish = async () => {
    setPublishing(true);
    try {
      await botsApi.publish(bot.id);
      notify('ok', 'Published! Visitors now see the latest version.');
    } catch (e) {
      notify('err', (e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    if (!confirm('Discard your unpublished changes and revert to the last published version?')) return;
    try {
      await botsApi.discard(bot.id);
      notify('ok', 'Reverted to the last published version.');
    } catch (e) {
      notify('err', (e as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${bot.name}"? Its Q&A, settings and orders will be lost and the widget will stop working.`)) return;
    try {
      await botsApi.remove(bot.id);
      notify('ok', 'Site deleted.');
      onDeleted();
    } catch (e) {
      notify('err', (e as Error).message);
    }
  };

  // Keep the active tab visible in the (horizontally scrollable) strip on small screens.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [tab]);

  // Cmd/Ctrl+S publishes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (bot.verified && dirty && !publishing) publish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const tabs: { id: SiteTab; label: string; icon: ReactNode; badge?: number; dot?: boolean; hidden?: boolean; alert?: number }[] = [
    { id: 'qa', label: 'Q&A', icon: <HelpCircle className="w-4 h-4" />, badge: bot.qa.length },
    { id: 'inbox', label: 'Inbox', icon: <Inbox className="w-4 h-4" />, badge: bot.unreadCount, dot: bot.unreadCount > 0 && !bot.needsHumanCount, alert: bot.needsHumanCount },
    { id: 'unanswered', label: 'Unanswered', icon: <MessageCircleQuestion className="w-4 h-4" />, badge: bot.unansweredCount, dot: bot.unansweredCount > 0 },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
    { id: 'embed', label: 'Embed', icon: <Code className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders', icon: <Mail className="w-4 h-4" />, badge: bot.orderCount, hidden: !bot.enableOrders },
    { id: 'verify', label: 'Verify', icon: <Shield className="w-4 h-4" />, dot: !bot.verified },
  ];

  return (
    <div className="flex-1 flex min-w-0 min-h-0">
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="relative border-b border-slate-200/80 glass"><div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brand-500/0 via-brand-500/70 to-gold-400/0" />
          <div className="px-4 sm:px-6 lg:px-10 pt-4 sm:pt-5 pb-4 flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3 xl:gap-4">
            <div className="min-w-0 flex items-start gap-3">
              <span
                className="hidden sm:flex w-11 h-11 rounded-xl items-center justify-center text-white text-base font-semibold shrink-0 overflow-hidden shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]"
                style={{ background: bot.themeColor }}
                aria-hidden
              >
                {bot.logoUrl ? <img src={bot.logoUrl} alt="" className="w-full h-full object-cover" /> : hostname(bot.url).charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <button onClick={onBack} className="text-slate-500 hover:text-slate-800 transition-colors">Sites</button>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <h1 className="font-semibold text-slate-900 truncate min-w-0 max-w-[60vw] sm:max-w-[420px] text-base" dir="auto">{bot.name}</h1>
                  <VerifiedBadge verified={bot.verified} />
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                  <a href={bot.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 inline-flex items-center gap-1 min-w-0 max-w-full transition-colors">
                    <Globe className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{bot.url}</span> <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  <SaveIndicator state={botsApi.saveState} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="basis-full sm:basis-auto"><PublishStatus bot={bot} dirty={dirty} /></div>
              {dirty && bot.published && (
                <Button variant="secondary" size="md" icon={<RotateCcw className="w-4 h-4" />} onClick={discard} title="Discard unpublished changes"><span className="hidden sm:inline">Discard</span></Button>
              )}
              <Button
                onClick={publish}
                loading={publishing}
                disabled={!bot.verified || !dirty}
                icon={<Rocket className="w-4 h-4" />}
                title={!bot.verified ? 'Verify your domain first' : !dirty ? 'No changes to publish' : 'Publish current draft (Ctrl+S)'}
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </Button>
              <Button
                variant="secondary"
                icon={<MonitorSmartphone className="w-4 h-4" />}
                onClick={() => openPage(`/simulate?bot=${bot.id}`)}
                title="See your draft bot on your real website"
              >
                <span className="hidden sm:inline">Preview on my site</span>
              </Button>
              {!previewOpen && (
                <IconButton label="Show preview" variant="secondary" className="hidden xl:inline-flex p-2 rounded-lg" onClick={() => setPreviewOpen(true)}>
                  <PanelRightOpen className="w-4 h-4" />
                </IconButton>
              )}
              <IconButton label="Delete site" variant="danger" className="p-2 ms-auto sm:ms-0" onClick={remove}>
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </div>
          </div>

          {!bot.published && <SetupSteps bot={bot} onGo={(t) => onTabChange(t)} />}

          <nav
            ref={tabsRef}
            className="px-4 sm:px-6 lg:px-10 flex gap-1 -mb-px overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] lg:[mask-image:none]"
            aria-label="Site sections"
          >
            {tabs.filter((t) => !t.hidden).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onTabChange(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className={`absolute inset-x-0.5 top-1 bottom-1.5 rounded-lg transition-colors ${active ? '' : 'group-hover:bg-slate-100'}`} aria-hidden />
                  <span className="relative inline-flex items-center gap-2">
                    <span className={active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}>{t.icon}</span>
                    <span>{t.label}</span>
                    {typeof t.badge === 'number' && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full tabular-nums ${active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{t.badge}</span>
                    )}
                    {!!t.alert && <span className="text-[11px] px-1.5 py-0.5 rounded-full tabular-nums bg-amber-500 text-white font-semibold" title={`${t.alert} waiting for your reply`}>{t.alert} need reply</span>}
                    {t.dot && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse-soft" />}
                  </span>
                </button>
              );
            })}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          <div key={tab} className="px-4 sm:px-6 lg:px-10 pt-6 pb-24 xl:pb-6 max-w-5xl animate-fade-up">
            {tab === 'qa' && <QATab key={bot.id} bot={bot} onUpdate={update} />}
            {tab === 'inbox' && <InboxTab bot={bot} onCounts={(c) => botsApi.setCounts(bot.id, c)} />}
            {tab === 'unanswered' && (
              <UnansweredTab bot={bot} onUpdate={update} onCount={(n) => botsApi.setCounts(bot.id, { unansweredCount: n })} />
            )}
            {tab === 'appearance' && <AppearanceTab bot={bot} onUpdate={update} onUpload={(f, file) => botsApi.upload(bot.id, f, file)} />}
            {tab === 'embed' && <EmbedTab bot={bot} dirty={dirty} publishing={publishing} onPublish={publish} onGoVerify={() => onTabChange('verify')} />}
            {tab === 'orders' && <OrdersTab bot={bot} onCount={(n) => botsApi.setCounts(bot.id, { orderCount: n })} />}
            {tab === 'verify' && <VerifyTab bot={bot} onVerify={() => botsApi.verify(bot.id)} onNext={() => onTabChange('qa')} />}
          </div>
        </div>
      </div>

      {/* Preview: docked on desktop; on mobile a slide-over portaled to <body> so it sits above the top bar. */}
      {previewOpen && isDesktop && (
        <aside className="w-[clamp(360px,28vw,440px)] shrink-0 border-l border-slate-200/80 bg-white h-full">
          <PreviewPanel bot={bot} dirty={dirty} onClose={() => setPreviewOpen(false)} onOpenInbox={() => onTabChange('inbox')} />
        </aside>
      )}
      {previewOpen && !isDesktop && createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Live preview">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-[fade-up_0.2s_ease-out]" onClick={() => setPreviewOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-full sm:max-w-md bg-white shadow-pop sm:border-l border-slate-200/80 sm:rounded-l-3xl overflow-hidden animate-[slide-in_0.25s_cubic-bezier(0.22,1,0.36,1)] pb-[env(safe-area-inset-bottom)]">
            <PreviewPanel bot={bot} dirty={dirty} onClose={() => setPreviewOpen(false)} onOpenInbox={() => { setPreviewOpen(false); onTabChange('inbox'); }} />
          </aside>
        </div>,
        document.body,
      )}
      {!previewOpen && (
        <button
          onClick={() => setPreviewOpen(true)}
          className="xl:hidden fixed bottom-5 right-5 w-14 h-14 rounded-full text-white shadow-pop flex items-center justify-center z-30 active:scale-95 transition-transform"
          style={{ background: bot.themeColor }}
          aria-label="Open preview"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'saving') return <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> Saving draft…</span>;
  if (state === 'error') return <span className="text-red-600 font-medium">Couldn't save — retrying on next edit</span>;
  return <span className="inline-flex items-center gap-1 text-slate-400"><Check className="w-3 h-3" /> Draft saved</span>;
}

/** Shown until the first publish: the four steps from new site to live widget. */
function SetupSteps({ bot, onGo }: { bot: Bot; onGo: (t: SiteTab) => void }) {
  const steps: { label: string; done: boolean; tab: SiteTab }[] = [
    { label: 'Write Q&A', done: bot.qa.some((q) => q.question && q.answer), tab: 'qa' },
    { label: 'Verify domain', done: bot.verified, tab: 'verify' },
    { label: 'Publish', done: !!bot.published, tab: 'embed' },
    { label: 'Embed on site', done: false, tab: 'embed' },
  ];
  const current = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="px-4 sm:px-6 lg:px-10 pb-4">
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-r from-brand-50/60 via-white to-gold-50/40 px-3.5 py-3 flex items-center gap-4 flex-wrap">
        <div className="text-xs text-slate-600 shrink-0">
          <span className="font-semibold text-slate-900">Setup</span> · {doneCount} of {steps.length} done
        </div>
        <ol className="flex items-center gap-1 sm:gap-1.5 text-xs overflow-x-auto flex-1 min-w-0">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                onClick={() => onGo(s.tab)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${
                  s.done ? 'bg-green-50 border-green-200 text-green-700'
                    : i === current ? 'bg-brand-600 border-brand-600 text-white font-semibold shadow-brand'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {s.done
                  ? <Check className="w-3 h-3" />
                  : <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${i === current ? 'bg-white/20' : 'bg-slate-100'}`}>{i + 1}</span>}
                {s.label}
              </button>
              {i < steps.length - 1 && <span className={`w-4 sm:w-6 h-px ${s.done ? 'bg-green-300' : 'bg-slate-200'}`} />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

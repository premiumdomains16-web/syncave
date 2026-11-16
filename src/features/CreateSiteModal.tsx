import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, CircleAlert, Globe, X } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { TemplateIcon } from '@/components/TemplateIcon';
import { TemplateChatPreview } from '@/components/TemplateChatPreview';
import { BLANK_TEMPLATE, TEMPLATES, type BotTemplate } from '@shared/templates';
import { Button } from '@/components/ui';
import { PlanNotice, PRICING_URL, usePlan } from '@/components/PlanLock';
import { PAID_PLANS_AVAILABLE } from '@shared/plans';

const ALL_TEMPLATES: BotTemplate[] = [BLANK_TEMPLATE, ...TEMPLATES];

interface Props {
  open: boolean;
  /** When false (no sites yet) the modal is the onboarding screen and can't be dismissed. */
  dismissible: boolean;
  /** Prefills the URL (e.g. the site a visitor tried in the simulator before signing up). */
  initialUrl?: string;
  /** How many sites the account already has — used to show the plan's site limit. */
  siteCount: number;
  onClose: () => void;
  onCreate: (url: string, templateId: string) => Promise<void>;
}

export function CreateSiteModal({ open, dismissible, onClose, onCreate, initialUrl, siteCount }: Props) {
  const { plan, limits, name: planName } = usePlan();
  const atSiteLimit = limits.sites !== null && siteCount >= limits.sites;
  const [url, setUrl] = useState('');
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setUrl(''); setTemplateId(BLANK_TEMPLATE.id); setError(null); }
    else if (initialUrl) setUrl(initialUrl);
  }, [open, initialUrl]);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  const submit = async () => {
    if (!url.trim() || busy || atSiteLimit) return;
    setBusy(true); setError(null);
    try {
      await onCreate(url.trim(), templateId);
    } catch (e) {
      setError((e as Error).message || 'Failed to add website. Please check the URL and try again.');
    } finally {
      setBusy(false);
    }
  };

  const selected = ALL_TEMPLATES.find((t) => t.id === templateId) ?? BLANK_TEMPLATE;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={(e) => dismissible && e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="create-site-title"
            initial={{ scale: 0.96, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-5xl max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-pop border border-slate-200/80 overflow-hidden"
          >
            <div className="shrink-0 px-6 sm:px-7 py-5 border-b border-slate-100 bg-white flex items-center gap-3">
              <LogoMark size={40} className="shrink-0 drop-shadow-md" />
              <div>
                <h2 id="create-site-title" className="text-lg font-semibold text-slate-900 tracking-tight">
                  {siteCount === 0 ? 'Add your first website' : 'Add a website'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Enter your site and pick a starting template — we'll prefill the welcome, theme and a ready-to-edit Q&amp;A.</p>
              </div>
              {dismissible && (
                <button onClick={onClose} className="ml-auto p-2 hover:bg-slate-100 rounded-lg text-slate-400" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-7 py-6 space-y-6">
              {atSiteLimit && (
                <PlanNotice plan={plan} need={(l) => l.sites === null || l.sites > (limits.sites ?? 0)} title={`Your ${planName} plan includes ${limits.sites} website${limits.sites === 1 ? '' : 's'}.`}>
                  Upgrade to add more websites, or delete one you no longer need.
                </PlanNotice>
              )}
              <div>
                <label htmlFor="site-url" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Website URL</label>
                <div className="relative mt-2">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="site-url"
                    type="text"
                    inputMode="url"
                    placeholder="your-website.com"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    className={`w-full pl-10 pr-3 py-2.5 bg-white border rounded-xl text-sm outline-none focus:ring-2 transition-all ${
                      error ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                    }`}
                    autoFocus
                  />
                </div>
                {error
                  ? <p className="mt-2 text-xs text-red-600 flex items-center gap-1"><CircleAlert className="w-3.5 h-3.5" />{error}</p>
                  : <p className="mt-2 text-xs text-slate-400">We'll read the page title to name your bot. https:// is added automatically.</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Template</span>
                  <span className="text-[11px] text-slate-400">{ALL_TEMPLATES.length} options · pick one to preview it</span>
                </div>
                <div className="grid md:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
                  <div className="grid sm:grid-cols-2 gap-2 md:max-h-[440px] md:overflow-y-auto custom-scrollbar md:pe-1" role="radiogroup" aria-label="Template">
                    {ALL_TEMPLATES.map((t, idx) => (
                      <TemplateRow key={t.id} t={t} index={idx} selected={templateId === t.id} onSelect={() => setTemplateId(t.id)} />
                    ))}
                  </div>
                  <div className="md:sticky md:top-0">
                    <TemplateChatPreview
                      templateId={selected.id}
                      botName={selected.label}
                      welcome={selected.welcomeMessage}
                      qa={selected.qa.map((x) => ({ q: x.question, a: x.answer }))}
                      color={selected.themeColor}
                      height="h-[250px]"
                      labels={{ online: 'Online', suggested: 'Customers also ask', placeholder: 'Type a question…' }}
                      className="shadow-card"
                    />
                    <p className="mt-2.5 text-[11px] text-slate-500 text-center">
                      {selected.qa.length} ready-to-edit questions{selected.metric ? ` · ${selected.metric}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 px-6 sm:px-7 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center gap-3 flex-wrap">
              {atSiteLimit ? (
                // Say why right next to the button, not only at the top of the dialog.
                <div className="flex items-center gap-2 text-xs text-amber-800 min-w-0 flex-1">
                  <CircleAlert className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    Your {planName} plan includes {limits.sites} website{limits.sites === 1 ? '' : 's'} and you've used {siteCount === 1 ? 'it' : 'them all'}.
                    {PAID_PLANS_AVAILABLE ? 'Delete a site or upgrade to add another.' : 'Delete a site to add another. Paid plans with more websites are coming soon.'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ background: `${selected.themeColor}1a`, color: selected.themeColor }}>
                    <TemplateIcon id={selected.id} className="w-3.5 h-3.5" />
                  </span>
                  <span className="truncate"><strong className="text-slate-700 font-semibold">{selected.label}</strong> · {selected.qa.length} questions ready</span>
                </div>
              )}
              {atSiteLimit ? (
                <a href={PRICING_URL} onClick={onClose} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-gold-500 hover:bg-gold-600 px-5 py-2.5 text-sm font-semibold text-white shadow-cta">
                  Upgrade <ArrowRight className="w-4 h-4" />
                </a>
              ) : (
                <Button
                  className="ml-auto px-5 py-2.5"
                  onClick={submit}
                  loading={busy}
                  disabled={!url.trim()}
                  title={!url.trim() ? 'Enter your website address first' : undefined}
                >
                  {busy ? 'Adding…' : <>Continue <ArrowRight className="w-4 h-4" /></>}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TemplateRow({ t, index, selected, onSelect }: { t: BotTemplate; index: number; selected: boolean; onSelect: () => void }) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.18 }}
      onClick={onSelect}
      className={`group relative text-left rounded-2xl border p-3 flex items-start gap-3 transition-[background-color,border-color,box-shadow] ${
        selected ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <span
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${t.themeColor}1a`, color: t.themeColor }}
      >
        <TemplateIcon id={t.id} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-900 truncate">{t.label}</span>
          {selected && (
            <span className="ml-auto inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-brand-600 text-white shrink-0">
              <Check className="w-3 h-3" />
            </span>
          )}
        </span>
        <span className="block text-[11.5px] text-slate-500 leading-snug mt-0.5 line-clamp-1">{t.tagline}</span>
        <span className="block text-[11px] text-slate-400 mt-1">{t.qa.length} {t.qa.length === 1 ? 'question' : 'questions'}</span>
      </span>
    </motion.button>
  );
}

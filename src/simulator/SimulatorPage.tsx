// /simulate — shows a website with a Syncave bot on top of it.
//   ?url=<site>   demo bot (public; used from the landing page)
//   ?bot=<id>     the owner's *draft* bot on its own site (login required). Locked to the
//                 site's saved address: a ?url= param is ignored and the address can't be edited.
// The site is a server-side snapshot in a sandboxed iframe (see server/routes/simulate.ts);
// the real widget runs in this page, layered over the frame, in preview mode.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CircleAlert, ExternalLink, Globe, Loader2, Lock, Monitor, RotateCw, Smartphone } from 'lucide-react';
import type { Bot } from '@shared/types';
import { LogoMark } from '@/components/Logo';
import { LangToggle, useCopy, useLang, type Lang } from '@/i18n';
import { useAuth } from '@/auth';
import { hostname } from '@/lib/format';

export const PENDING_SITE_KEY = 'syncave_pending_site';

interface Snapshot { id: string; url: string; title: string; lang: Lang; }
interface PreviewBot {
  id: string; name: string; welcomeMessage: string; fallbackMessage: string; themeColor: string;
  logoUrl: string | null; backgroundImageUrl: string | null; enableOrders: boolean;
  qa: { id: string; question: string; answer: string }[];
}

const COPY = {
  en: {
    title: 'Try Syncave on your website',
    subtitle: 'Paste your website address and see how the chat looks on your own site.',
    placeholder: 'your-website.com',
    go: 'Preview',
    desktop: 'Desktop', mobile: 'Mobile',
    loading: 'Loading your website…',
    demoNote: (host: string) => `Demo bot on a snapshot of ${host}. Click the chat bubble to try it — links open in a new tab.`,
    draftNote: 'Showing your draft bot on your website. Publish from the dashboard to make it live.',
    blankHint: 'Site looks empty? Some websites block previews — your bot still works once installed.',
    cta: 'Create my bot — free',
    back: 'Back to dashboard',
    errorTitle: "We couldn't load this website",
    errorBody: 'Your bot is still shown below so you can try it.',
    retry: 'Try again',
    draft: 'Draft preview',
    locked: 'Preview is locked to this site',
  },
  ar: {
    title: 'جرّب Syncave على موقعك',
    subtitle: 'الصق عنوان موقعك وشوف الشات هيبان إزاي على موقعك.',
    placeholder: 'your-website.com',
    go: 'عاين',
    desktop: 'كمبيوتر', mobile: 'موبايل',
    loading: 'بنحمّل موقعك…',
    demoNote: (host: string) => `بوت تجريبي على نسخة من ${host}. دوس على أيقونة الشات وجرّبه — اللينكات بتفتح في تاب جديد.`,
    draftNote: 'ده البوت بتاعك (المسودة) على موقعك. انشره من لوحة التحكم علشان يشتغل للزوار.',
    blankHint: 'الموقع باين فاضي؟ بعض المواقع بتمنع المعاينة — البوت هيشتغل عادي لما تركّبه.',
    cta: 'اعمل البوت بتاعي — مجاناً',
    back: 'الرجوع للوحة التحكم',
    errorTitle: 'مقدرناش نحمّل الموقع ده',
    errorBody: 'البوت لسه ظاهر تحت علشان تقدر تجربه.',
    retry: 'جرّب تاني',
    draft: 'معاينة المسودة',
    locked: 'المعاينة مقفولة على الموقع ده',
  },
};

/** Sample bot for visitors who don't have one yet — in the site's language, named after the site. */
function demoBot(lang: Lang, siteName: string): PreviewBot {
  const ar = lang === 'ar';
  const q = (id: string, question: string, answer: string) => ({ id, question, answer });
  return {
    id: 'demo',
    name: siteName,
    themeColor: '#157a6e',
    logoUrl: null,
    backgroundImageUrl: null,
    enableOrders: true,
    welcomeMessage: ar ? `أهلاً بيك في ${siteName}! إزاي أقدر أساعدك؟` : `Hi! Welcome to ${siteName}. How can I help you today?`,
    fallbackMessage: ar
      ? 'في البوت الحقيقي، الأسئلة اللي لسه مجاوبتش عليها بتاخد الرسالة دي — وتقدر تغيّرها.'
      : "In your real bot, questions you haven't answered yet get this message — and you can change it.",
    qa: ar
      ? [
          q('d1', 'بتقدموا إيه؟', 'دي **معاينة من Syncave**. بعد ما تسجّل، هتكتب هنا الإجابة الحقيقية — مثلاً ملخص قصير لمنتجاتك أو خدماتك.'),
          q('d2', 'الأسعار كام؟', 'هنا هتكتب أسعارك الحقيقية. Syncave بيرد بس بالإجابات اللي إنت موافق عليها — عمره ما هيألف سعر.'),
          q('d3', 'مواعيد العمل إيه؟', 'اكتب مواعيدك مرة واحدة، والبوت يرد على السؤال ده ٢٤ ساعة.'),
          q('d4', 'أتواصل معاكم إزاي؟', 'حط رقمك أو الواتساب أو الإيميل هنا علشان الزوار يوصلولك بسهولة.'),
        ]
      : [
          q('d1', 'What do you offer?', "This is a **Syncave preview**. After you sign up you'll write the real answer here — for example a short summary of your products or services."),
          q('d2', 'How much are your prices?', 'Your real prices go here. Syncave only replies with answers you approve — it never makes prices up.'),
          q('d3', 'What are your opening hours?', 'Add your hours once, and the bot answers this question 24/7.'),
          q('d4', 'How can I contact you?', 'Put your phone, WhatsApp or email here so visitors can reach you easily.'),
        ],
  };
}

function toPreviewBot(b: Bot): PreviewBot {
  return {
    id: b.id, name: b.name, welcomeMessage: b.welcomeMessage, fallbackMessage: b.fallbackMessage,
    themeColor: b.themeColor, logoUrl: b.logoUrl, backgroundImageUrl: b.backgroundImageUrl,
    enableOrders: b.enableOrders, qa: b.qa.filter((q) => q.question.trim()),
  };
}

export function SimulatorPage() {
  const t = useCopy(COPY);
  const { lang } = useLang();
  const { status } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const botId = params.get('bot');
  const urlParam = params.get('url') ?? '';

  const [input, setInput] = useState(urlParam);
  const [ownerBot, setOwnerBot] = useState<Bot | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>(() => (window.innerWidth < 768 ? 'mobile' : 'desktop'));
  const layerRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  // Owners always preview the site they added; only the public demo takes any address.
  const siteUrl = botId ? (ownerBot?.url ?? '') : urlParam;

  // Owner mode: load the draft bot (login required).
  useEffect(() => {
    if (!botId) return;
    if (status === 'signedOut') {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (status !== 'signedIn') return;
    fetch('/api/bots')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((bots: Bot[]) => {
        const b = bots.find((x) => x.id === botId);
        if (b) setOwnerBot(b); else setError('not-found');
      })
      .catch(() => setError('not-found'));
  }, [botId, status]);

  // Snapshot the website.
  const load = async (url: string) => {
    setLoading(true); setError(null); setSnapshot(null);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'failed');
      setSnapshot(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (siteUrl) load(siteUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteUrl]);

  // Mount the real widget (in preview mode) once we know which bot to show.
  const bot: PreviewBot | null = botId
    ? ownerBot && toPreviewBot(ownerBot)
    : siteUrl && !loading && (snapshot || error)
      ? demoBot(snapshot?.lang ?? lang, snapshot?.title || hostname(siteUrl))
      : null;

  useEffect(() => {
    if (!bot || !layerRef.current || mounted.current) return;
    mounted.current = true;
    // Owner previewing their own draft: chats are saved to the Inbox as test conversations.
    (window as any).SyncavePreview = { bot, container: layerRef.current, ...(botId ? { testLog: true, pageUrl: siteUrl } : {}) };
    const s = document.createElement('script');
    s.src = '/widget.js';
    document.body.appendChild(s);
  }, [bot]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v || botId) return;
    // Full reload: the widget mounts once per page.
    const qs = new URLSearchParams({ url: v });
    window.location.assign(`/simulate?${qs}`);
  };

  const startSignup = () => {
    try { sessionStorage.setItem(PENDING_SITE_KEY, snapshot?.url || siteUrl); } catch {}
    window.location.assign('/signup');
  };

  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  const host = siteUrl ? hostname(snapshot?.url || siteUrl) : '';

  // ---------- Empty state: just the URL form ----------
  if (!botId && !siteUrl) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <TopBar right={<LangToggle />} />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-xl text-center">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-3 text-slate-600">{t.subtitle}</p>
            <UrlForm value={input} onChange={setInput} onSubmit={submit} placeholder={t.placeholder} button={t.go} big />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      <TopBar
        center={botId
          ? <LockedAddress host={host} title={t.locked} />
          : <UrlForm value={input || siteUrl} onChange={setInput} onSubmit={submit} placeholder={t.placeholder} button={t.go} />}
        right={
          <div className="flex items-center gap-2">
            <div className="hidden sm:inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group">
              {(['desktop', 'mobile'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  aria-pressed={device === d}
                  title={d === 'desktop' ? t.desktop : t.mobile}
                  className={`p-1.5 rounded-md ${device === d ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {d === 'desktop' ? <Monitor className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                </button>
              ))}
            </div>
            <LangToggle className="hidden md:inline-flex" />
            {botId ? (
              <a href={`/app#/sites/${botId}`} className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                {t.back}
              </a>
            ) : (
              <button onClick={startSignup} className="inline-flex items-center gap-1.5 rounded-lg bg-gold-500 hover:bg-gold-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-cta whitespace-nowrap">
                {t.cta} <Arrow className="w-4 h-4" />
              </button>
            )}
          </div>
        }
      />

      <div className="shrink-0 px-4 py-2 text-[11px] sm:text-xs text-slate-600 bg-brand-50 border-b border-brand-100 flex items-center justify-center gap-2 text-center">
        {botId && <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 font-semibold">{t.draft}</span>}
        <span>{botId ? t.draftNote : t.demoNote(host)}</span>
        {snapshot && <span className="hidden lg:inline text-slate-400">· {t.blankHint}</span>}
      </div>

      <main className="flex-1 min-h-0 flex items-center justify-center sm:p-3 md:p-5">
        <div
          className={`relative bg-white shadow-2xl shadow-slate-400/30 overflow-hidden flex flex-col transition-all duration-300 ${
            device === 'mobile' ? 'w-full h-full sm:w-[390px] sm:max-h-[820px] sm:rounded-[2rem] sm:border-[10px] sm:border-slate-900' : 'w-full h-full rounded-xl border border-slate-300'
          }`}
        >
          {device === 'desktop' && (
            <div className="shrink-0 h-9 px-3 flex items-center gap-2 bg-slate-100 border-b border-slate-200" dir="ltr">
              <span className="flex gap-1.5">{['bg-red-400', 'bg-amber-400', 'bg-green-400'].map((c) => <span key={c} className={`w-2.5 h-2.5 rounded-full ${c}`} />)}</span>
              <span className="flex-1 max-w-md mx-auto flex items-center gap-1.5 rounded-md bg-white border border-slate-200 px-2.5 py-0.5 text-xs text-slate-500 truncate">
                <Globe className="w-3 h-3 shrink-0" /> {host}
              </span>
              {snapshot && (
                <a href={snapshot.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-700" title={snapshot.url}><ExternalLink className="w-3.5 h-3.5" /></a>
              )}
            </div>
          )}

          <div className="relative flex-1 min-h-0">
            {snapshot && (
              <iframe
                key={snapshot.id}
                src={`/api/simulate/${snapshot.id}`}
                title={snapshot.title}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full border-0 bg-white"
              />
            )}
            {(loading || (botId && !ownerBot && !error)) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 bg-white">
                <Loader2 className="w-7 h-7 animate-spin text-brand-500" />
                <span className="text-sm">{t.loading}</span>
              </div>
            )}
            {error && !loading && (
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_12px,#f1f5f9_12px,#f1f5f9_24px)]">
                <div className="max-w-sm text-center rounded-xl bg-white border border-slate-200 p-6 shadow-sm">
                  <CircleAlert className="w-8 h-8 text-amber-500 mx-auto" />
                  <h2 className="mt-3 font-semibold text-slate-900">{t.errorTitle}</h2>
                  <p className="mt-1 text-sm text-slate-500">{error === 'not-found' ? '' : error}</p>
                  {error !== 'not-found' && <p className="mt-1 text-sm text-slate-500">{t.errorBody}</p>}
                  {siteUrl && (
                    <button onClick={() => load(siteUrl)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
                      <RotateCw className="w-4 h-4" /> {t.retry}
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* The widget mounts here. `transform` makes its position:fixed relative to this box. */}
            <div
              ref={layerRef}
              className={`sim-widget-layer absolute inset-0 overflow-hidden ${device === 'mobile' ? 'sb-force-mobile' : ''}`}
              style={{ transform: 'translateZ(0)' }}
              dir="ltr"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function TopBar({ center, right }: { center?: React.ReactNode; right?: React.ReactNode }) {
  return (
    // Phones: logo + actions on the first row, the address box full-width below.
    <header className="shrink-0 min-h-16 px-3 sm:px-5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 bg-white border-b border-slate-200">
      <a href="/" className="inline-flex items-center gap-2 shrink-0" aria-label="Syncave">
        <LogoMark size={28} />
        <span className="font-bold tracking-tight" lang="en">Syncave</span>
      </a>
      {center && <div className="order-last basis-full md:order-none md:basis-auto md:flex-1 min-w-0 flex justify-center">{center}</div>}
      <div className="ms-auto md:ms-0">{right}</div>
    </header>
  );
}

/** Owner preview: the site's address shown read-only, so the preview can't be pointed elsewhere. */
function LockedAddress({ host, title }: { host: string; title: string }) {
  return (
    <div className="w-full max-w-xl flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" dir="ltr" title={title} aria-label={title}>
      <Lock className="w-4 h-4 shrink-0 text-slate-500" />
      <span className="truncate font-medium">{host || '…'}</span>
      <span className="ms-auto shrink-0 text-[11px] text-slate-500 hidden sm:inline" dir="auto">{title}</span>
    </div>
  );
}

function UrlForm({ value, onChange, onSubmit, placeholder, button, big }: {
  value: string; onChange: (v: string) => void; onSubmit: (e: FormEvent) => void; placeholder: string; button: string; big?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className={`flex items-center gap-2 w-full ${big ? 'mt-8' : 'max-w-xl'}`}>
      <div className="relative flex-1 min-w-0">
        <Globe className={`absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 ${big ? 'w-5 h-5' : 'w-4 h-4'}`} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode="url"
          dir="ltr"
          aria-label={placeholder}
          className={`w-full rounded-lg border border-slate-300 bg-white ps-10 pe-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${big ? 'py-3.5 text-base' : 'py-2 text-sm'}`}
          autoFocus={big}
        />
      </div>
      <button type="submit" className={`shrink-0 rounded-lg bg-slate-900 hover:bg-slate-800 font-semibold text-white ${big ? 'px-6 py-3.5' : 'px-4 py-2 text-sm'}`}>
        {button}
      </button>
    </form>
  );
}

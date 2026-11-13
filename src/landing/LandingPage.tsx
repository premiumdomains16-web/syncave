import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Clock, Code2, GitBranch, Languages, LayoutTemplate,
  Menu, MessageSquare, Palette, Send, ShieldCheck, ShoppingBag, Sparkles, X,
} from 'lucide-react';
import { TEMPLATES } from '@shared/templates';
import { LogoMark } from '@/components/Logo';
import { TemplateIcon } from '@/components/TemplateIcon';
import { TemplateChatPreview } from '@/components/TemplateChatPreview';
import { LangToggle, useCopy, useLang } from '@/i18n';
import { useAuth } from '@/auth';
import { linkProps } from '@/hooks/usePath';
import { LANDING_COPY, PLANS, SUPPORT_EMAIL, yearlyPerMonth, type LandingCopy } from './content';
import { PAID_PLANS_AVAILABLE } from '@shared/plans';

const FEATURE_ICONS = [Languages, ShieldCheck, LayoutTemplate, ShoppingBag, Palette, GitBranch];
const PROOF_ICONS = [Languages, Code2, ShieldCheck];

export function LandingPage() {
  const c = useCopy(LANDING_COPY);
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <PublicHeader c={c} />
      <main>
        <Hero c={c} />
        <Proof c={c} />
        <Features c={c} />
        <HowItWorks c={c} />
        <Templates c={c} />
        <Pricing c={c} />
        <Faq c={c} />
        <FinalCta c={c} />
      </main>
      <Footer c={c} />
    </div>
  );
}

// ---------- Shared bits ----------

function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

/** Fades content up once it scrolls into view. */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({ eyebrow, title, subtitle, dark }: { eyebrow?: string; title: string; subtitle?: string; dark?: boolean }) {
  return (
    <Reveal className="max-w-2xl mx-auto text-center mb-14">
      {eyebrow && (
        <div className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] mb-3 ${dark ? 'text-brand-200' : 'text-brand-600'}`}>
          <span className="w-5 h-px bg-current opacity-60" aria-hidden />
          {eyebrow}
          <span className="w-5 h-px bg-current opacity-60" aria-hidden />
        </div>
      )}
      <h2 className={`text-3xl sm:text-4xl font-bold tracking-tight text-balance ${dark ? 'text-white' : 'text-brand-950'}`}>{title}</h2>
      {subtitle && <p className={`mt-4 text-lg text-pretty ${dark ? 'text-white/75' : 'text-slate-600'}`}>{subtitle}</p>}
    </Reveal>
  );
}

/** Orange call-to-action (default) or a teal outlined button, as in the header. */
function PrimaryLink({ href, children, size = 'md', tone = 'cta' }: { href: string; children: ReactNode; size?: 'md' | 'lg'; tone?: 'cta' | 'outline' }) {
  const { lang } = useLang();
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  const colors = tone === 'outline'
    ? 'border-[1.5px] border-brand-600 text-brand-700 hover:bg-brand-600 hover:text-white'
    : 'btn-glossy bg-gold-500 hover:bg-gold-600 text-white shadow-cta';
  return (
    <a
      {...linkProps(href)}
      className={`group shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[0.98] ${colors} ${
        size === 'lg' ? 'px-6 py-3.5 text-base' : 'px-4 py-2 text-sm'
      }`}
    >
      {children}
      <Arrow className="w-4 h-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
    </a>
  );
}

/** Renders **bold** in short copy strings. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p))}</>;
}

// ---------- Header ----------

export function PublicHeader({ c }: { c: LandingCopy }) {
  const { status } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // Over the mint hero the header is transparent; once scrolled it becomes white glass.
  const floating = !scrolled && !open;
  const links = [
    { href: '#features', label: c.nav.features },
    { href: '#how', label: c.nav.how },
    { href: '#pricing', label: c.nav.pricing },
    { href: '#faq', label: c.nav.faq },
  ];
  const linkCls = 'px-3 py-2 text-sm font-medium text-slate-600 hover:text-brand-700 rounded-lg transition-colors';
  return (
    <header
      className={`sticky top-0 z-40 border-b text-slate-900 transition-[background-color,border-color,box-shadow] duration-300 ${
        floating ? 'bg-transparent border-transparent' : 'bg-white/90 backdrop-blur-md border-slate-200/70 shadow-[0_8px_24px_-12px_rgba(12,42,42,0.12)]'
      }`}
    >
      <Container className="h-16 flex items-center justify-between gap-4">
        <a {...linkProps('/')} className="inline-flex items-center gap-2.5" aria-label="Syncave">
          <LogoMark size={30} className="drop-shadow-sm" />
          <span className="font-bold text-lg tracking-tight text-brand-950" lang="en">Syncave</span>
        </a>
        <nav className="hidden md:flex items-center gap-1" aria-label="Main">
          {links.map((l) => (
            <a key={l.href} href={l.href} className={linkCls}>{l.label}</a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <LangToggle />
          {status === 'signedIn' ? (
            <PrimaryLink href="/app" tone="outline">{c.nav.dashboard}</PrimaryLink>
          ) : (
            <>
              <a {...linkProps('/login')} className={linkCls}>{c.nav.login}</a>
              <PrimaryLink href="/signup" tone="outline">{c.nav.start}</PrimaryLink>
            </>
          )}
        </div>
        <button className="md:hidden p-2 -me-2 rounded-lg text-slate-700 hover:bg-white/70" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </Container>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-slate-200 bg-white text-slate-900 overflow-hidden"
          >
            <Container className="py-3 flex flex-col gap-1">
              {links.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-3 py-2.5 text-base font-medium text-slate-700 rounded-lg hover:bg-slate-50">{l.label}</a>
              ))}
              <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-slate-100">
                <LangToggle />
                {status === 'signedIn' ? (
                  <PrimaryLink href="/app">{c.nav.dashboard}</PrimaryLink>
                ) : (
                  <div className="flex items-center gap-2">
                    <a {...linkProps('/login')} className="px-3 py-2 text-sm font-medium text-slate-700">{c.nav.login}</a>
                    <PrimaryLink href="/signup">{c.nav.start}</PrimaryLink>
                  </div>
                )}
              </div>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// ---------- Hero ----------

const stagger = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
});

function Hero({ c }: { c: LandingCopy }) {
  return (
    <section className="relative overflow-hidden bg-mint text-slate-900 -mt-16 pt-16">
      <div aria-hidden className="absolute inset-0">
        <div className="absolute inset-0 bg-dots opacity-50 [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_60%)]" />
        <div className="absolute -top-40 end-[-10%] w-[640px] h-[640px] rounded-full bg-white/70 blur-3xl" />
        <div className="absolute bottom-[-35%] start-[-10%] w-[520px] h-[520px] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white" />
      </div>
      <Container className="relative pt-14 pb-24 sm:pt-20 sm:pb-28 grid lg:grid-cols-[1.1fr_1fr] gap-14 items-center">
        <div className="text-center lg:text-start">
          <motion.span {...stagger(0)} className="inline-flex items-center gap-2 rounded-full bg-white shadow-card px-3 py-1 text-sm font-medium text-brand-800">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-gold-400 animate-ping opacity-75" />
              <span className="relative w-2 h-2 rounded-full bg-gold-500" />
            </span>
            {c.hero.badge}
          </motion.span>
          <motion.h1 {...stagger(1)} className="mt-6 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold tracking-tight leading-[1.15] text-balance text-brand-950">
            {c.hero.title}{' '}
            <span className="text-brand-600">{c.hero.titleAccent}</span>
          </motion.h1>
          <motion.p {...stagger(2)} className="mt-6 text-lg text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0 text-pretty">{c.hero.subtitle}</motion.p>
          <motion.div {...stagger(3)} className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <PrimaryLink href="/signup" size="lg">{c.hero.primary}</PrimaryLink>
            <a href="#how" className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-base font-semibold text-slate-800 hover:border-brand-300 hover:text-brand-700 transition-colors">
              {c.hero.secondary}
            </a>
          </motion.div>
          <motion.p {...stagger(4)} className="mt-4 text-sm text-slate-500">{c.hero.note}</motion.p>
          <motion.div {...stagger(5)}><TryOnSite c={c} /></motion.div>
        </div>
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}>
          <ChatMock c={c} />
        </motion.div>
      </Container>
    </section>
  );
}

/** Paste a URL → the simulator shows a demo bot on that website. */
function TryOnSite({ c }: { c: LandingCopy }) {
  const [url, setUrl] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (url.trim()) window.location.assign(`/simulate?url=${encodeURIComponent(url.trim())}`); }}
      className="mt-8 max-w-xl mx-auto lg:mx-0 rounded-2xl bg-white p-3 shadow-[0_20px_50px_-24px_rgba(12,42,42,0.35)]"
    >
      <label htmlFor="try-url" className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2 text-start">
        <Sparkles className="w-3.5 h-3.5 text-gold-500" /> {c.hero.tryLabel}
      </label>
      <div className="flex gap-2">
        <input
          id="try-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={c.hero.tryPlaceholder}
          inputMode="url"
          dir="ltr"
          className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 px-3.5 py-2.5 text-sm outline-none transition-[border-color,box-shadow,background-color] focus:bg-white focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100"
        />
        <button type="submit" className="btn-glossy shrink-0 rounded-xl bg-brand-600 text-white hover:bg-brand-700 px-5 py-2.5 text-sm font-semibold active:scale-[0.98] transition-[background-color,transform]">{c.hero.tryButton}</button>
      </div>
    </form>
  );
}

function ChatMock({ c }: { c: LandingCopy }) {
  const { lang } = useLang();
  const appear = (delay: number) => ({ initial: { opacity: 0, y: 10, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { delay, duration: 0.35 } });
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden key={lang}>
      <div className="absolute -inset-10 rounded-full bg-white/80 blur-2xl" />
      <div className="absolute -inset-4 rounded-[3rem] border border-brand-200/60" />
      {/* Floating channel dots around the phone, like a live conversation hub. */}
      <span className="hidden sm:flex absolute -top-4 start-6 z-10 w-9 h-9 rounded-full bg-gold-500 text-white items-center justify-center shadow-cta animate-float"><MessageSquare className="w-4 h-4" /></span>
      <span className="hidden sm:flex absolute top-1/2 -end-6 z-10 w-8 h-8 rounded-full bg-brand-500 text-white items-center justify-center shadow-brand animate-float [animation-delay:2s]"><Send className="w-3.5 h-3.5 rtl:-scale-x-100" /></span>

      {/* Floating proof pills, pulled from the proof copy so they stay honest. */}
      <motion.div {...appear(1.2)} className="hidden sm:block absolute -start-8 -bottom-5 z-10 animate-float">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 backdrop-blur px-3 py-2 shadow-pop flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><Languages className="w-3.5 h-3.5" /></span>
          <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">{c.proof[0].title}</span>
        </div>
      </motion.div>
      <motion.div {...appear(1.5)} className="hidden sm:block absolute -end-10 top-7 z-10 animate-float [animation-delay:1.5s]">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 backdrop-blur px-3 py-2 shadow-pop flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-gold-50 text-gold-600 flex items-center justify-center"><ShieldCheck className="w-3.5 h-3.5" /></span>
          <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">{c.proof[2].title}</span>
        </div>
      </motion.div>

      <div className="relative rounded-3xl bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.3)] border border-slate-200/80 overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3 text-white bg-gradient-to-r from-brand-600 to-brand-500">
          <div className="w-9 h-9 rounded-full bg-white/20 ring-2 ring-white/20 flex items-center justify-center"><MessageSquare className="w-4 h-4" /></div>
          <div>
            <div className="text-sm font-semibold">{c.chat.botName}</div>
            <div className="text-[11px] opacity-90 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-300" />{c.chat.online}</div>
          </div>
        </div>
        <div className="p-4 space-y-3 bg-slate-50 min-h-[300px]">
          <motion.div {...appear(0.5)} className="max-w-[85%] rounded-2xl rounded-ss-sm bg-white border border-slate-200/80 shadow-card px-3.5 py-2.5 text-sm text-slate-700">{c.chat.welcome}</motion.div>
          <motion.div {...appear(1.2)} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-se-sm bg-brand-600 px-3.5 py-2.5 text-sm text-white shadow-brand">{c.chat.question}</div>
          </motion.div>
          <TypingThenAnswer c={c} />
        </div>
        <div className="border-t border-slate-200/80 p-2.5 flex items-center gap-2 bg-white">
          <div className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-400">{c.chat.placeholder}</div>
          <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-brand"><Send className="w-4 h-4 rtl:-scale-x-100" /></div>
        </div>
        <div className="text-center text-[10px] text-slate-400 py-1.5 border-t border-slate-100">Powered by <span className="font-semibold text-brand-600">Syncave</span></div>
      </div>
    </div>
  );
}

/** Typing dots for a beat, then the bot's answer. */
function TypingThenAnswer({ c }: { c: LandingCopy }) {
  const [answered, setAnswered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnswered(true), 2800);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence mode="wait">
      {!answered ? (
        <motion.div key="typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }} transition={{ delay: 1.7, duration: 0.3 }} className="inline-flex gap-1 px-3.5 py-3 bg-white border border-slate-200/80 rounded-2xl rounded-ss-sm shadow-card">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </motion.div>
      ) : (
        <motion.div key="answer" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35 }} className="max-w-[85%] rounded-2xl rounded-ss-sm bg-white border border-slate-200/80 shadow-card px-3.5 py-2.5 text-sm text-slate-700">
          <Rich text={c.chat.answer} />
          <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 flex flex-wrap gap-1.5">
            {c.chat.chips.map((chip) => (
              <span key={chip} className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{chip}</span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- Sections ----------

function Proof({ c }: { c: LandingCopy }) {
  return (
    <section className="border-b border-slate-200/80 bg-white">
      <Container className="py-8 grid sm:grid-cols-3 gap-4 sm:gap-6">
        {c.proof.map((p, i) => {
          const Icon = PROOF_ICONS[i];
          return (
            <Reveal key={p.title} delay={i * 0.08} className="flex items-center sm:items-start gap-3.5 sm:justify-center">
              <span className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 shadow-card text-brand-600 flex items-center justify-center shrink-0"><Icon className="w-4.5 h-4.5" /></span>
              <div className="text-start">
                <div className="font-semibold text-slate-900">{p.title}</div>
                <div className="text-sm text-slate-500 mt-0.5">{p.body}</div>
              </div>
            </Reveal>
          );
        })}
      </Container>
    </section>
  );
}

function Features({ c }: { c: LandingCopy }) {
  return (
    <section id="features" className="py-24 scroll-mt-16">
      <Container>
        <SectionTitle eyebrow={c.features.eyebrow} title={c.features.title} subtitle={c.features.subtitle} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {c.features.items.map((f, i) => {
            const Icon = FEATURE_ICONS[i];
            return (
              <Reveal key={f.title} delay={(i % 3) * 0.08}>
                <div className="group relative h-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card hover:shadow-card-hover hover:border-brand-200 hover:-translate-y-1 transition-[box-shadow,border-color,transform] duration-300 overflow-hidden">
                  <div aria-hidden className="absolute -top-12 -end-12 w-40 h-40 rounded-full bg-gradient-to-br from-brand-100/70 to-gold-100/50 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform ${i % 2 ? 'bg-gold-50 text-gold-600' : 'bg-brand-50 text-brand-600'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-slate-900">{f.title}</h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.body}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

function HowItWorks({ c }: { c: LandingCopy }) {
  return (
    <section id="how" className="py-24 bg-mint scroll-mt-16 relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-dots opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_65%)]" />
      <Container className="relative">
        <SectionTitle eyebrow={c.how.eyebrow} title={c.how.title} />
        <div className="relative">
          <div aria-hidden className="hidden lg:block absolute top-[2.9rem] inset-x-[12%] border-t-2 border-dashed border-brand-200" />
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {c.how.steps.map((s, i) => (
              <li key={s.title} className="h-full">
                <Reveal delay={i * 0.1} className="h-full">
                  <div className="relative h-full rounded-2xl bg-white p-6 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-[box-shadow,transform] duration-300">
                    <div className={`relative w-10 h-10 rounded-full text-white font-bold flex items-center justify-center mb-4 ring-4 ring-white ${i === 0 ? 'bg-gold-500 shadow-cta' : 'bg-brand-600 shadow-brand'}`}>{i + 1}</div>
                    <h3 className="font-semibold text-slate-900">{s.title}</h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
        <Reveal className="mt-12 max-w-2xl mx-auto" delay={0.15}>
          <div className="text-sm text-slate-600 mb-2 flex items-center gap-2"><Code2 className="w-4 h-4 text-brand-600" />{c.how.snippetLabel}</div>
          <div className="rounded-xl bg-brand-950 shadow-pop overflow-hidden">
            <div className="h-8 px-3.5 flex items-center gap-1.5 border-b border-white/5 bg-white/[0.03]" aria-hidden>
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
            </div>
            <pre dir="ltr" className="p-4 text-sm font-mono text-brand-200 overflow-x-auto text-left">
              {`<script src="${window.location.origin}/widget.js?id=YOUR_ID"></script>`}
            </pre>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/** Pick an industry on the left; a live chat on the right plays that template's real questions. */
function Templates({ c }: { c: LandingCopy }) {
  const { lang } = useLang();
  const [id, setId] = useState(TEMPLATES[0].id);
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
  const sample = c.templates.samples?.[id] ?? { welcome: t.welcomeMessage, qa: t.qa.slice(0, 4).map((x) => ({ q: x.question, a: x.answer })) };
  const label = (tid: string, fallback: string) => c.templates.labels[tid] ?? fallback;

  return (
    <section id="templates" className="py-24 relative overflow-hidden scroll-mt-16">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] opacity-60" />
      <Container>
        <SectionTitle eyebrow={c.templates.eyebrow} title={c.templates.title} subtitle={c.templates.subtitle} />
        <div className="grid lg:grid-cols-[1fr_minmax(0,420px)] gap-8 lg:gap-12 items-start max-w-5xl mx-auto">
          <Reveal>
            <div className="text-sm font-semibold text-slate-900 mb-3">{c.templates.pick}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" role="radiogroup" aria-label={c.templates.pick}>
              {TEMPLATES.map((x) => {
                const on = x.id === id;
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setId(x.id)}
                    className={`group flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-start text-sm font-medium transition-[background-color,box-shadow,color,transform] duration-200 ${
                      on ? 'bg-brand-600 text-white shadow-brand' : 'bg-white text-slate-700 shadow-card hover:shadow-card-hover hover:-translate-y-0.5'
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-600'}`}>
                      <TemplateIcon id={x.id} />
                    </span>
                    <span className="leading-tight">{label(x.id, x.label)}</span>
                  </button>
                );
              })}
            </div>
          </Reveal>
          <Reveal delay={0.1} className="lg:sticky lg:top-24">
            <TemplateChatPreview
              key={lang}
              templateId={id}
              botName={label(id, t.label)}
              welcome={sample.welcome}
              qa={sample.qa}
              labels={{ online: c.chat.online, suggested: c.templates.suggested, placeholder: c.chat.placeholder }}
            />
            <div className="mt-5 flex flex-col sm:flex-row items-center gap-3 justify-between">
              <p className="text-xs text-slate-500 text-center sm:text-start">{c.templates.note}</p>
              <PrimaryLink href="/signup">{c.templates.cta}</PrimaryLink>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function Pricing({ c }: { c: LandingCopy }) {
  const { lang } = useLang();
  const [yearly, setYearly] = useState(false);
  const fmt = (n: number) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(n);

  return (
    <section id="pricing" className="py-24 bg-gradient-to-b from-white via-brand-50/60 to-white scroll-mt-16">
      <Container>
        <SectionTitle eyebrow={c.pricing.eyebrow} title={c.pricing.title} subtitle={c.pricing.subtitle} />

        <Reveal className="flex justify-center mb-10">
          <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white p-1 shadow-card" role="group" aria-label={c.pricing.title}>
            {[false, true].map((y) => (
              <button
                key={String(y)}
                onClick={() => setYearly(y)}
                aria-pressed={yearly === y}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${yearly === y ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {y ? c.pricing.yearly : c.pricing.monthly}
                {y && <span className={`ms-2 rounded-full px-2 py-0.5 text-[11px] ${yearly ? 'bg-gold-500 text-white' : 'bg-gold-100 text-gold-800'}`}>{c.pricing.yearlyBadge}</span>}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {PLANS.map((plan, i) => {
            const p = c.pricing.plans[plan.id];
            // Until paid plans launch, only Free can be started; it becomes the highlighted card.
            const soon = !PAID_PLANS_AVAILABLE && plan.id !== 'free';
            const highlighted = PAID_PLANS_AVAILABLE ? !!plan.highlighted : plan.id === 'free';
            const price = plan.monthly == null ? null : yearly ? yearlyPerMonth(plan.monthly) : plan.monthly;
            const href = plan.id === 'agency' ? `mailto:${SUPPORT_EMAIL}?subject=Syncave%20Agency` : `/signup${plan.id === 'free' ? '' : `?plan=${plan.id}`}`;
            const card = (
              <div className={`relative flex flex-col h-full rounded-2xl bg-white p-6 ${highlighted ? 'rounded-[calc(1rem-1.5px)]' : 'border border-slate-200/80 shadow-card hover:shadow-card-hover transition-shadow'}`}>
                {highlighted && (
                  <span className="absolute -top-3.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 rounded-full bg-gold-500 px-3 py-1 text-xs font-semibold text-white whitespace-nowrap shadow-cta">{PAID_PLANS_AVAILABLE ? c.pricing.popular : c.pricing.availableNow}</span>
                )}
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                  {p.name}
                  {soon && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{c.pricing.comingSoon}</span>}
                </h3>
                <p className="mt-1 text-sm text-slate-500 min-h-[2.5rem]">{p.tagline}</p>
                <div className="mt-5 min-h-[4.5rem]">
                  {price == null ? (
                    <div className="text-3xl font-bold text-slate-900">{c.pricing.custom}</div>
                  ) : price === 0 ? (
                    <div className="text-4xl font-bold text-slate-900">{c.pricing.free}</div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.span key={price} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="text-4xl font-bold text-slate-900 tabular-nums tracking-tight">{fmt(price)}</motion.span>
                        </AnimatePresence>
                        <span className="text-sm font-medium text-slate-500">{c.pricing.currency} {c.pricing.perMonth}</span>
                      </div>
                      {yearly && <div className="text-xs text-slate-500 mt-1">{c.pricing.billedYearly}</div>}
                    </>
                  )}
                </div>
                <ul className="mt-6 space-y-3 text-sm flex-1">
                  {p.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5">
                      {f.soon
                        ? <Clock className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                        : <span className="w-4 h-4 mt-0.5 shrink-0 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                      <span className={f.soon ? 'text-slate-500' : 'text-slate-700'}>
                        {f.text}
                        {f.soon && <span className="ms-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 align-middle">{c.pricing.soon}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {soon ? (
                  <span
                    aria-disabled="true"
                    className="mt-8 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-center text-sm font-semibold border border-dashed border-slate-300 bg-slate-50 text-slate-500 cursor-not-allowed select-none"
                  >
                    <Clock className="w-4 h-4" /> {c.pricing.comingSoon}
                  </span>
                ) : (
                  <a
                    {...(href.startsWith('/') ? linkProps(href) : { href })}
                    className={`mt-8 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-[background-color,border-color,color,transform] active:scale-[0.98] ${
                      highlighted ? 'btn-glossy bg-gold-500 text-white hover:bg-gold-600 shadow-cta' : 'border border-slate-300 bg-white text-slate-700 hover:border-brand-600 hover:text-brand-700'
                    }`}
                  >
                    {p.cta}
                  </a>
                )}
              </div>
            );
            return (
              <Reveal key={plan.id} delay={i * 0.07} className={highlighted ? 'h-full lg:-my-3' : 'h-full'}>
                {highlighted ? (
                  <div className="gradient-ring rounded-2xl h-full shadow-[0_20px_50px_-20px_rgba(21,122,110,0.45)]">{card}</div>
                ) : card}
              </Reveal>
            );
          })}
        </div>
        <Reveal><p className="mt-10 text-center text-sm text-slate-500 max-w-2xl mx-auto">{c.pricing.footnote}</p></Reveal>
      </Container>
    </section>
  );
}

function Faq({ c }: { c: LandingCopy }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-24 scroll-mt-16">
      <Container className="max-w-3xl">
        <SectionTitle eyebrow={c.faq.eyebrow} title={c.faq.title} />
        <Reveal>
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card divide-y divide-slate-100 overflow-hidden">
            {c.faq.items.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q} className={isOpen ? 'bg-slate-50/60' : ''}>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-5 text-start hover:bg-slate-50/80 transition-colors"
                  >
                    <span className="font-semibold text-slate-900">{item.q}</span>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${isOpen ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="px-5 sm:px-6 pb-5 -mt-1 text-slate-600 leading-relaxed">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function FinalCta({ c }: { c: LandingCopy }) {
  return (
    <section className="pb-24">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl surface-royal px-6 py-16 sm:py-20 text-center text-white shadow-[0_30px_80px_-30px_rgba(21,122,110,0.6)]">
            <div aria-hidden className="absolute inset-0 bg-dots-light [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <div aria-hidden className="absolute -bottom-24 -end-24 w-80 h-80 rounded-full bg-white/10 blur-2xl" />
            <div aria-hidden className="absolute -top-24 -start-24 w-72 h-72 rounded-full bg-gold-300/20 blur-2xl" />
            <div className="relative">
              <LogoMark size={48} className="mx-auto mb-6 drop-shadow-lg ring-4 ring-white/20 rounded-[14px]" />
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">{c.cta.title}</h2>
              <p className="mt-4 text-lg text-white/85 max-w-xl mx-auto">{c.cta.subtitle}</p>
              <a {...linkProps('/signup')} className="btn-glossy mt-8 inline-flex items-center justify-center rounded-xl bg-gold-500 px-6 py-3.5 text-base font-semibold text-white hover:bg-gold-600 transition-[background-color,transform] active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)]">
                {c.cta.button}
              </a>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function Footer({ c }: { c: LandingCopy }) {
  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <Container className="py-12 grid sm:grid-cols-[2fr_1fr_1fr] gap-8 text-sm">
        <div>
          <div className="inline-flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-bold text-base" lang="en">Syncave</span>
          </div>
          <p className="mt-3 text-slate-500 max-w-xs leading-relaxed">{c.footer.tagline}</p>
        </div>
        <div>
          <div className="font-semibold text-slate-900 mb-3">{c.footer.product}</div>
          <ul className="space-y-2 text-slate-600">
            <li><a href="#features" className="hover:text-brand-600 transition-colors">{c.nav.features}</a></li>
            <li><a href="#pricing" className="hover:text-brand-600 transition-colors">{c.nav.pricing}</a></li>
            <li><a href="#faq" className="hover:text-brand-600 transition-colors">{c.nav.faq}</a></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-slate-900 mb-3">{c.footer.contact}</div>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-slate-600 hover:text-brand-600 transition-colors" dir="ltr">{SUPPORT_EMAIL}</a>
        </div>
      </Container>
      <div className="border-t border-slate-100">
        <Container className="py-5 text-xs text-slate-400 flex items-center justify-between gap-4 flex-wrap">
          <span>© {new Date().getFullYear()} Syncave. {c.footer.rights}</span>
          <LangToggle className="-me-2.5" />
        </Container>
      </div>
    </footer>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Check, CircleAlert, Eye, EyeOff, Loader2, MessageSquare } from 'lucide-react';
import type { Plan } from '@shared/types';
import { PAID_PLANS_AVAILABLE } from '@shared/plans';
import { LogoMark } from '@/components/Logo';
import { LangToggle, useCopy } from '@/i18n';
import { AuthError, useAuth } from '@/auth';
import { linkProps, navigateTo } from '@/hooks/usePath';
import { LANDING_COPY } from './content';

type Mode = 'login' | 'signup';

const COPY = {
  en: {
    login: { title: 'Welcome back', subtitle: 'Log in to manage your chatbots.', submit: 'Log in', switchText: "Don't have an account?", switchLink: 'Start free' },
    signup: { title: 'Create your account', subtitle: 'Free plan · No credit card needed.', submit: 'Create account', switchText: 'Already have an account?', switchLink: 'Log in' },
    name: 'Your name', email: 'Email', password: 'Password', passwordHint: 'At least 8 characters', show: 'Show password', hide: 'Hide password',
    planNote: (plan: string) => `You picked the ${plan} plan. After creating your account you can pay by InstaPay or Vodafone Cash, and we'll activate ${plan} once the payment is confirmed.`,
    errors: {
      name: 'Please enter your name.', email: 'Please enter a valid email address.', password: 'Password must be at least 8 characters.',
      wrong: 'Incorrect email or password.', taken: 'An account with this email already exists. Try logging in.',
      tooMany: 'Too many attempts. Please wait a few minutes and try again.', network: 'Could not reach the server. Check your connection.',
      generic: 'Something went wrong. Please try again.',
      notConfirmed: 'Please confirm your email first. Open the link we sent you, then log in.',
      weak: 'Please choose a stronger password.',
    },
    confirm: { title: 'Check your email', body: (email: string) => `We sent a confirmation link to ${email}. Open it to activate your account, then log in.`, action: 'Go to log in' },
    back: 'Back to home',
  },
  ar: {
    login: { title: 'أهلاً بيك تاني', subtitle: 'سجّل دخولك علشان تدير الشات بوت بتاعك.', submit: 'تسجيل الدخول', switchText: 'معندكش حساب؟', switchLink: 'ابدأ مجاناً' },
    signup: { title: 'اعمل حسابك', subtitle: 'باقة مجانية · من غير كارت بنكي.', submit: 'إنشاء الحساب', switchText: 'عندك حساب؟', switchLink: 'سجّل دخولك' },
    name: 'اسمك', email: 'البريد الإلكتروني', password: 'كلمة السر', passwordHint: '٨ حروف على الأقل', show: 'إظهار كلمة السر', hide: 'إخفاء كلمة السر',
    planNote: (plan: string) => `اخترت باقة ${plan}. بعد ما تعمل حسابك تقدر تدفع بإنستاباي أو فودافون كاش، وهنفعّل باقة ${plan} أول ما نأكد الدفع.`,
    errors: {
      name: 'من فضلك اكتب اسمك.', email: 'من فضلك اكتب بريد إلكتروني صحيح.', password: 'كلمة السر لازم تكون ٨ حروف على الأقل.',
      wrong: 'البريد الإلكتروني أو كلمة السر غلط.', taken: 'فيه حساب بالبريد ده بالفعل. جرّب تسجّل دخولك.',
      tooMany: 'محاولات كتير. استنى دقايق وجرّب تاني.', network: 'مش قادرين نوصل للسيرفر. اتأكد من الإنترنت.',
      generic: 'حصلت مشكلة. جرّب تاني.',
      notConfirmed: 'من فضلك أكّد بريدك الإلكتروني الأول. افتح اللينك اللي بعتناهولك وبعدين سجّل دخولك.',
      weak: 'من فضلك اختار كلمة سر أقوى.',
    },
    confirm: { title: 'شوف بريدك الإلكتروني', body: (email: string) => `بعتنا لينك تأكيد على ${email}. افتحه علشان تفعّل حسابك، وبعدين سجّل دخولك.`, action: 'روح لتسجيل الدخول' },
    back: 'الرجوع للرئيسية',
  },
};

const PAID_PLANS: Plan[] = ['starter', 'business', 'agency'];

/** Only allow redirects back into this app (never to another site). */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app';
}

export function AuthPage({ mode }: { mode: Mode }) {
  const t = useCopy(COPY);
  const landing = useCopy(LANDING_COPY);
  const { status, login, signup } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const next = safeNext(params.get('next'));
  const plan = params.get('plan') as Plan | null;
  const pickedPlan = PAID_PLANS_AVAILABLE && mode === 'signup' && plan && PAID_PLANS.includes(plan) ? plan : null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  // Already logged in? Go straight to the dashboard.
  useEffect(() => {
    if (status === 'signedIn') window.location.replace(next);
  }, [status, next]);

  const m = t[mode];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && !name.trim()) return setError(t.errors.name);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t.errors.email);
    if (mode === 'signup' && password.length < 8) return setError(t.errors.password);

    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else if ((await signup({ name: name.trim(), email: email.trim(), password, plan: pickedPlan ?? undefined })) === 'confirm') {
        setConfirmSent(true);
        setBusy(false);
        return;
      }
      // Full load: the dashboard is a separate area with its own layout and direction.
      // Picked a paid plan on the pricing page: continue to payment.
      window.location.assign(pickedPlan && pickedPlan !== 'agency' ? `/app#/billing/${pickedPlan}` : next);
    } catch (err) {
      const status = err instanceof AuthError ? err.status : -1;
      setError(
        status === 401 ? t.errors.wrong
          : status === 403 ? t.errors.notConfirmed
          : status === 422 ? t.errors.weak
          : status === 409 ? t.errors.taken
          : status === 429 ? t.errors.tooMany
          : status === 0 ? t.errors.network
          : t.errors.generic,
      );
      setBusy(false);
    }
  };

  const switchHref = mode === 'login' ? '/signup' : `/login${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — desktop only. */}
      <aside className="hidden lg:flex relative overflow-hidden surface-royal text-white flex-col justify-between p-12">
        <div aria-hidden className="absolute inset-0 bg-dots-light [mask-image:radial-gradient(ellipse_at_top_left,black_10%,transparent_70%)]" />
        <div aria-hidden className="absolute -top-32 -end-32 w-[520px] h-[520px] rounded-full bg-brand-600/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -start-20 w-[460px] h-[460px] rounded-full bg-white/10 blur-3xl" />

        <a {...linkProps('/')} className="relative inline-flex items-center gap-2.5 w-fit" aria-label={t.back}>
          <LogoMark size={32} className="drop-shadow-lg" />
          <span className="font-bold text-lg tracking-tight" lang="en">Syncave</span>
        </a>

        <div className="relative max-w-md">
          <motion.h2 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-3xl xl:text-4xl font-bold tracking-tight leading-tight text-balance">
            {landing.hero.title} <span className="text-brand-100">{landing.hero.titleAccent}</span>
          </motion.h2>
          <ul className="mt-8 space-y-4">
            {landing.proof.map((p, i) => (
              <motion.li key={p.title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }} className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-gold-500 text-white flex items-center justify-center shrink-0"><Check className="w-3 h-3" /></span>
                <div>
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-sm text-white/65">{p.body}</div>
                </div>
              </motion.li>
            ))}
          </ul>

          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.45 }} className="mt-10 rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur p-4 max-w-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-8 h-8 rounded-full bg-brand-500/30 ring-1 ring-white/10 flex items-center justify-center"><MessageSquare className="w-4 h-4 text-brand-200" /></span>
              <div className="text-sm font-semibold">{landing.chat.botName}</div>
              <span className="ms-auto text-[11px] text-white/65 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />{landing.chat.online}</span>
            </div>
            <div className="flex justify-end mb-2"><span className="rounded-2xl rounded-se-sm bg-brand-600 px-3 py-2 text-xs">{landing.chat.question}</span></div>
            <div className="rounded-2xl rounded-ss-sm bg-white/10 px-3 py-2 text-xs text-slate-100">{landing.chat.answer.replace(/\*\*/g, '')}</div>
          </motion.div>
        </div>

        <div className="relative text-xs text-white/50">© {new Date().getFullYear()} Syncave</div>
      </aside>

      {/* Form side. */}
      <div className="min-h-screen lg:min-h-0 flex flex-col bg-slate-50 lg:bg-white relative">
        <div aria-hidden className="lg:hidden absolute inset-x-0 top-0 h-72 -z-0 bg-gradient-to-b from-brand-100/60 to-transparent" />
        <header className="relative h-16 px-4 sm:px-6 flex items-center justify-between">
          <a {...linkProps('/')} className="inline-flex items-center gap-2.5 lg:invisible" aria-label={t.back}>
            <LogoMark size={30} />
            <span className="font-bold text-lg tracking-tight" lang="en">Syncave</span>
          </a>
          <LangToggle />
        </header>

        <main className="relative flex-1 flex items-center justify-center px-4 py-10">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-md">
            {confirmSent ? (
              <div className="rounded-3xl border border-slate-200/80 bg-white p-7 sm:p-8 shadow-pop lg:shadow-none lg:border-0 lg:p-4 text-center">
                <span className="mx-auto w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center"><MessageSquare className="w-6 h-6" /></span>
                <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">{t.confirm.title}</h1>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed" dir="auto">{t.confirm.body(email.trim())}</p>
                <a {...linkProps('/login')} onClick={(e) => { e.preventDefault(); navigateTo('/login'); }} className="mt-6 inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-brand-300 hover:text-brand-700">
                  {t.confirm.action}
                </a>
              </div>
            ) : (
            <div className="rounded-3xl border border-slate-200/80 bg-white p-7 sm:p-8 shadow-pop lg:shadow-none lg:border-0 lg:p-4">
              <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-slate-900">{m.title}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{m.subtitle}</p>

              {pickedPlan && (
                <div className="mt-5 rounded-xl border border-brand-200/80 bg-brand-50 px-3.5 py-3 text-sm text-brand-800 leading-relaxed">
                  {t.planNote(landing.pricing.plans[pickedPlan].name)}
                </div>
              )}

              <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
                {mode === 'signup' && (
                  <Field id="name" label={t.name}>
                    <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} dir="auto" autoFocus />
                  </Field>
                )}
                <Field id="email" label={t.email}>
                  <input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} dir="ltr" autoFocus={mode === 'login'} />
                </Field>
                <Field id="password" label={t.password} hint={mode === 'signup' ? t.passwordHint : undefined}>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${INPUT} pe-11`}
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute inset-y-1 end-1 px-2.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      aria-label={showPw ? t.hide : t.show}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>

                {error && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200/80 px-3.5 py-3 text-sm text-red-700" role="alert">
                    <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                  </motion.p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="btn-glossy w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gold-500 hover:bg-gold-600 px-4 py-3 text-sm font-semibold text-white shadow-cta disabled:opacity-60 transition-[background-color,transform] active:scale-[0.99]"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {m.submit}
                </button>
              </form>
            </div>
            )}

            {!confirmSent && <p className="mt-6 text-center text-sm text-slate-600">
              {m.switchText}{' '}
              <a {...linkProps(switchHref)} onClick={(e) => { e.preventDefault(); setError(null); navigateTo(switchHref); }} className="font-semibold text-brand-600 hover:text-brand-700">
                {m.switchLink}
              </a>
            </p>}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

const INPUT = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] hover:border-slate-300 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

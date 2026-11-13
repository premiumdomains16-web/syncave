// Small presentational building blocks used across the dashboard.
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Check, CircleAlert, CircleCheck, Copy, Info, Loader2 } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------- Button ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gold-500 hover:bg-gold-600 text-white shadow-cta disabled:bg-none disabled:bg-slate-100 disabled:text-slate-500 disabled:ring-1 disabled:ring-inset disabled:ring-slate-200 disabled:shadow-none',
  secondary: 'bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 disabled:opacity-50',
  ghost: 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40',
  danger: 'text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40',
  dark: 'bg-[#14151c] hover:bg-slate-800 text-white disabled:opacity-40',
};
const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5 rounded-md',
  md: 'px-4 py-2 text-sm gap-2 rounded-xl',
  lg: 'px-5 py-2.5 text-sm gap-2 rounded-xl',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-medium transition-[background-color,border-color,box-shadow,transform] duration-150 whitespace-nowrap',
        'active:scale-[0.98] disabled:active:scale-100 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
        VARIANTS[variant], SIZES[size], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, variant = 'ghost', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: Variant }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        'p-1.5 rounded-md transition-[background-color,border-color,color,transform] duration-150 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        VARIANTS[variant], className,
      )}
      {...rest}
    />
  );
}

// ---------- Form controls ----------

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => <input ref={ref} className={cx(FIELD, className)} {...rest} />
);

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(FIELD, 'resize-y leading-relaxed', className)} {...rest} />;
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-700 mb-1.5">
        {label} {hint && <span className="font-normal text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative w-10 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
          checked ? 'bg-brand-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]' : 'bg-slate-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]',
        )}
      >
        <span className={cx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.25)] transition-transform duration-200', checked && 'translate-x-4')} />
      </button>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

// ---------- Layout ----------

export function Card({ title, desc, action, children, className }: { title?: ReactNode; desc?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('bg-white rounded-3xl p-5 sm:p-6 shadow-card', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
            {desc && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4 flex-wrap animate-fade-up">
      <div>
        <h1 className="text-2xl sm:text-[1.75rem] font-bold text-brand-950 tracking-tight">{title}</h1>
        {desc && <p className="text-sm text-slate-500 mt-1">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionHeader({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-lg font-semibold text-brand-950 tracking-tight">{title}</h2>
        {desc && <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageBody({ children, width = 'max-w-5xl' }: { children: ReactNode; width?: string }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cx('px-4 sm:px-6 lg:px-10 py-8 mx-auto w-full', width)}>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, desc, action }: { icon: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="relative w-14 h-14 mx-auto mb-4">
        <div className="absolute inset-0 rounded-2xl bg-brand-100 rotate-6" aria-hidden />
        <div className="relative w-14 h-14 rounded-2xl bg-white border border-slate-200 text-brand-600 flex items-center justify-center shadow-card">{icon}</div>
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {desc && <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------- Feedback ----------

type Tone = 'green' | 'amber' | 'red' | 'indigo' | 'slate';

const BADGE: Record<Tone, string> = {
  green: 'bg-green-100 text-green-700 border-transparent',
  amber: 'bg-amber-100 text-amber-700 border-transparent',
  red: 'bg-red-100 text-red-700 border-transparent',
  indigo: 'bg-brand-50 text-brand-700 border-transparent',
  slate: 'bg-slate-100 text-slate-600 border-transparent',
};

export function Badge({ tone = 'slate', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap', BADGE[tone], className)}>
      {icon}{children}
    </span>
  );
}

const ALERT: Record<Exclude<Tone, 'slate'>, { box: string; icon: ReactNode; title: string; body: string }> = {
  green: { box: 'bg-green-50/80 border-green-200/80', icon: <CircleCheck className="w-5 h-5 text-green-600" />, title: 'text-green-900', body: 'text-green-700' },
  amber: { box: 'bg-amber-50/80 border-amber-200/80', icon: <CircleAlert className="w-5 h-5 text-amber-600" />, title: 'text-amber-900', body: 'text-amber-700' },
  red: { box: 'bg-red-50/80 border-red-200/80', icon: <CircleAlert className="w-5 h-5 text-red-600" />, title: 'text-red-900', body: 'text-red-700' },
  indigo: { box: 'bg-brand-50/80 border-brand-200/80', icon: <Info className="w-5 h-5 text-brand-600" />, title: 'text-brand-900', body: 'text-brand-700' },
};

export function Alert({ tone, title, children, action, icon }: { tone: keyof typeof ALERT; title: ReactNode; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  const s = ALERT[tone];
  return (
    <div className={cx('border rounded-2xl p-4 flex items-start gap-3 animate-fade-up', s.box)}>
      <span className="shrink-0 mt-0.5">{icon ?? s.icon}</span>
      <div className="flex-1 min-w-0">
        <div className={cx('text-sm font-semibold', s.title)}>{title}</div>
        {children && <div className={cx('text-xs mt-0.5 leading-relaxed', s.body)}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ---------- Code ----------

export function CodeBlock({ code, onCopy, copied, tone = 'light' }: { code: string; onCopy?: () => void; copied?: boolean; tone?: 'light' | 'amber' }) {
  return (
    <div className="group relative rounded-xl bg-slate-950 ring-1 ring-white/10 shadow-pop overflow-hidden">
      <div className="h-8 px-3.5 flex items-center gap-1.5 border-b border-white/5 bg-white/[0.03]" aria-hidden>
        <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
      </div>
      <pre className={cx('p-4 pr-24 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all', tone === 'amber' ? 'text-amber-300' : 'text-slate-100')}>
        {code}
      </pre>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className={cx(
            'absolute top-1.5 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
            copied ? 'bg-green-500/20 text-green-300' : 'bg-white/10 hover:bg-white/20 text-white',
          )}
        >
          {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      )}
    </div>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="px-1.5 py-0.5 bg-slate-100 border border-slate-200/70 rounded-md text-[0.85em] font-mono text-slate-800">{children}</code>;
}

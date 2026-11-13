// Syncave brand mark: an arch (the "cave" your knowledge lives in) with a
// signal dot inside (the conversation it syncs out). Keep in sync with the
// favicon in index.html.
import { useId } from 'react';

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-brand-500)" />
          <stop offset="1" stopColor="var(--color-brand-800)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path d="M9.5 23.5V15.5a6.5 6.5 0 0 1 13 0v8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="17.5" r="2.4" fill="var(--color-gold-400)" />
    </svg>
  );
}

export function Logo({ size = 'md', subtitle, tone = 'light' }: { size?: 'sm' | 'md'; subtitle?: string; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size === 'sm' ? 28 : 32} className={`shrink-0 ${dark ? 'drop-shadow-[0_0_12px_rgba(31,151,135,0.6)]' : 'drop-shadow-sm'}`} />
      {size === 'md' && (
        <span className="text-left">
          <span className={`block font-semibold tracking-tight leading-none text-[15px] ${dark ? 'text-white' : 'text-slate-900'}`}>Syncave</span>
          {subtitle && <span className={`block text-[11px] mt-1 leading-none ${dark ? 'text-white/65' : 'text-slate-500'}`}>{subtitle}</span>}
        </span>
      )}
    </span>
  );
}

// Plan awareness for the dashboard: current limits, and the "available on X" notice
// shown next to a locked feature. Upgrades are handled by sales for now (see README),
// so every upgrade link just opens the pricing section.
import type { ReactNode } from 'react';
import { ArrowUpRight, Lock, Sparkles } from 'lucide-react';
import type { Plan } from '@shared/types';
import { limitsFor, nextPlanWhere, PAID_PLANS_AVAILABLE, PLAN_NAMES, type PlanLimits } from '@shared/plans';
import { useAuth } from '@/auth';

export const PRICING_URL = '/app#/billing';

export function usePlan(): { plan: Plan; limits: PlanLimits; name: string } {
  const { user } = useAuth();
  const plan: Plan = user?.plan ?? 'free';
  return { plan, limits: limitsFor(plan), name: PLAN_NAMES[plan] };
}

export function UpgradeLink({ children = 'See plans', className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <a href={PRICING_URL} className={`inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 whitespace-nowrap ${className}`}>
      {children} <ArrowUpRight className="w-3.5 h-3.5" />
    </a>
  );
}

/** Compact lock badge for a feature the current plan doesn't include. */
export function PlanLockBadge({ plan, need }: { plan: Plan; need: (l: PlanLimits) => boolean }) {
  const next = nextPlanWhere(plan, need);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-50 to-gold-50 border border-brand-200/70 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
      <Lock className="w-3 h-3" /> {next ? PLAN_NAMES[next] : 'Higher plan'}
    </span>
  );
}

/** Full-width notice explaining a limit, with the upgrade link. */
export function PlanNotice({ title, children, plan, need }: { title: ReactNode; children?: ReactNode; plan: Plan; need: (l: PlanLimits) => boolean }) {
  const next = nextPlanWhere(plan, need);
  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-200/70 bg-gradient-to-r from-brand-50 via-white to-gold-50/70 p-4 flex flex-wrap items-start gap-x-3 gap-y-2 animate-fade-up">
      <span className="shrink-0 w-8 h-8 rounded-lg ai-gradient text-white flex items-center justify-center shadow-brand"><Sparkles className="w-4 h-4" /></span>
      <div className="flex-1 min-w-[12rem]">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {children && <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{children}</div>}
      </div>
      {PAID_PLANS_AVAILABLE
        ? <UpgradeLink className="text-xs shrink-0 sm:mt-1 ms-11 sm:ms-0">{next ? `Get ${PLAN_NAMES[next]}` : 'See plans'}</UpgradeLink>
        : <span className="text-xs font-semibold text-slate-500 shrink-0 sm:mt-1 ms-11 sm:ms-0">{next ? `${PLAN_NAMES[next]} plan coming soon` : 'Paid plans coming soon'}</span>}
    </div>
  );
}

/** Thin usage meter: used / limit, turning amber near the cap. */
export function UsageMeter({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const tone = limit === null ? 'ai-gradient' : pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'ai-gradient';
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="tabular-nums text-slate-500">{used.toLocaleString('en-US')}{limit === null ? '' : ` / ${limit.toLocaleString('en-US')}`}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: limit === null ? '100%' : `${pct}%`, opacity: limit === null ? 0.35 : 1 }} />
      </div>
    </div>
  );
}

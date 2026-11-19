// Admin dashboard: overview numbers, every user's plan (turn plans on by hand, extend,
// or move back to Free), and the manual payment review queue. Visible only to
// ADMIN_EMAILS (shared/billing.ts); the API enforces this too.
import { useEffect, useState, type ReactNode } from 'react';
import { BadgeCheck, CalendarClock, Check, Clock, ExternalLink, ImageOff, RefreshCw, Search, Settings2, TrendingUp, Users, Wallet, X } from 'lucide-react';
import type { PaymentStatus } from '@shared/billing';
import type { Plan } from '@shared/types';
import { PLAN_NAMES } from '@shared/plans';
import { api, type AdminPayment, type AdminStats, type AdminUser } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Badge, Button, Card, EmptyState, PageBody, PageHeader, TextInput } from '@/components/ui';
import { RowsSkeleton } from '@/components/ui/Skeleton';

const METHOD: Record<string, string> = { instapay: 'InstaPay', vodafone_cash: 'Vodafone Cash' };
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function PaymentsPanel({ onPendingCount }: { onPendingCount?: (n: number) => void }) {
  const notify = useToast();
  const [status, setStatus] = useState<PaymentStatus>('pending');
  const [list, setList] = useState<AdminPayment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const load = async (s = status) => {
    setLoading(true);
    try {
      const { payments } = await api.adminPayments(s);
      setList(payments);
      if (s === 'pending') onPendingCount?.(payments.length);
    } catch (e) {
      notify('err', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { setList(null); load(status); }, [status]);

  const approve = async (p: AdminPayment) => {
    if (!confirm(`Approve ${p.amountEgp} EGP from ${p.user?.email ?? 'this customer'} and activate ${PLAN_NAMES[p.plan]} (${p.period})?`)) return;
    setWorking(p.id);
    try {
      const r = await api.approvePayment(p.id);
      notify('ok', `Activated ${PLAN_NAMES[p.plan]} until ${new Date(r.planExpiresAt).toLocaleDateString('en-GB')}.`);
      await load();
    } catch (e) { notify('err', (e as Error).message); } finally { setWorking(null); }
  };

  const reject = async (p: AdminPayment) => {
    const note = prompt('Reason shown to the customer (e.g. "Payment not received", "Wrong amount"):', 'Payment not received');
    if (note === null) return;
    setWorking(p.id);
    try {
      await api.rejectPayment(p.id, note);
      notify('ok', 'Payment rejected.');
      await load();
    } catch (e) { notify('err', (e as Error).message); } finally { setWorking(null); }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="text-sm text-slate-500 max-w-xl">Check each payment in your InstaPay or Vodafone Cash account before approving. Approving activates the plan right away.</p>
        <Button variant="secondary" icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />} onClick={() => load()} disabled={loading}>Refresh</Button>
      </div>
      <div className="inline-flex rounded-lg bg-white shadow-card p-0.5 mb-5 text-sm font-semibold" role="group" aria-label="Status">
        {(['pending', 'approved', 'rejected'] as PaymentStatus[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className={`px-3.5 py-1.5 rounded-md capitalize transition-colors ${status === s ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>{s}</button>
        ))}
      </div>

      {list === null ? <RowsSkeleton rows={4} /> : list.length === 0 ? (
        <Card><EmptyState icon={<Check className="w-6 h-6" />} title={status === 'pending' ? 'Nothing to review' : `No ${status} payments`} desc={status === 'pending' ? 'New payments appear here when customers submit them.' : undefined} /></Card>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold text-slate-900 tabular-nums">{p.amountEgp.toLocaleString('en-US')} EGP</span>
                    <Badge tone="indigo">{PLAN_NAMES[p.plan]} · {p.period}</Badge>
                    <Badge tone="slate">{METHOD[p.method]}</Badge>
                    {p.status !== 'pending' && <Badge tone={p.status === 'approved' ? 'green' : 'red'}>{p.status}</Badge>}
                  </div>
                  <div className="text-sm text-slate-700">{p.user ? <>{p.user.name} · <span className="font-mono text-xs">{p.user.email}</span> · now on {PLAN_NAMES[p.user.plan]}</> : 'Account deleted'}</div>
                  <div className="text-xs text-slate-500">
                    Paid from <span className="font-mono text-slate-700" dir="ltr">{p.sender}</span> · ref <span className="font-mono text-slate-700" dir="ltr">{p.reference}</span> · submitted {fmtDateTime(p.createdAt)}
                  </div>
                  {p.note && <div className="text-xs text-red-700">Reason: {p.note}</div>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {p.proofUrl
                    ? <a href={p.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Receipt <ExternalLink className="w-3.5 h-3.5" /></a>
                    : <span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><ImageOff className="w-3.5 h-3.5" /> No receipt</span>}
                  {p.status === 'pending' && (
                    <>
                      <Button variant="secondary" icon={<X className="w-4 h-4" />} onClick={() => reject(p)} disabled={working === p.id}>Reject</Button>
                      <Button icon={<Check className="w-4 h-4" />} onClick={() => approve(p)} loading={working === p.id}>Approve</Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

type AdminTab = 'overview' | 'users' | 'payments';
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const daysLeft = (iso: string) => Math.ceil((Date.parse(iso) - Date.now()) / 86400000);

export function AdminPage({ onPendingCount, pendingCount = 0 }: { onPendingCount?: (n: number) => void; pendingCount?: number }) {
  const [tab, setTab] = useState<AdminTab>(pendingCount > 0 ? 'payments' : 'overview');
  return (
    <PageBody width="max-w-6xl">
      <PageHeader title="Admin" desc="Accept payments and manage every customer's plan." />
      <div className="inline-flex rounded-xl bg-white shadow-card p-1 mb-6 text-sm font-semibold" role="tablist">
        {([['overview', 'Overview'], ['users', 'Users'], ['payments', 'Payments']] as [AdminTab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg inline-flex items-center gap-2 transition-colors ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            {label}
            {id === 'payments' && pendingCount > 0 && <span className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] tabular-nums flex items-center justify-center ${tab === id ? 'bg-white/25' : 'bg-gold-500 text-white'}`}>{pendingCount}</span>}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewPanel onOpen={setTab} />}
      {tab === 'users' && <UsersPanel onOpenPayments={() => setTab('payments')} />}
      {tab === 'payments' && <PaymentsPanel onPendingCount={onPendingCount} />}
    </PageBody>
  );
}

function OverviewPanel({ onOpen }: { onOpen: (t: AdminTab) => void }) {
  const notify = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => { api.adminStats().then(setStats).catch((e) => notify('err', (e as Error).message)); }, []);
  if (!stats) return <RowsSkeleton rows={3} />;
  const egp = (n: number) => `${n.toLocaleString('en-US')} EGP`;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile icon={<Clock className="w-4 h-4" />} label="Payments to review" value={stats.pendingPayments} tone={stats.pendingPayments ? 'amber' : undefined} onClick={() => onOpen('payments')} />
        <StatTile icon={<BadgeCheck className="w-4 h-4" />} label="Paying customers" value={stats.paying} onClick={() => onOpen('users')} />
        <StatTile icon={<CalendarClock className="w-4 h-4" />} label="Plans ending within 7 days" value={stats.expiringSoon} tone={stats.expiringSoon ? 'amber' : undefined} onClick={() => onOpen('users')} />
        <StatTile icon={<Wallet className="w-4 h-4" />} label="Revenue this month" value={egp(stats.revenueThisMonth)} />
        <StatTile icon={<TrendingUp className="w-4 h-4" />} label="Revenue, all time" value={egp(stats.revenueTotal)} />
        <StatTile icon={<Users className="w-4 h-4" />} label="Users" value={stats.users} sub={`${stats.newUsers30d} new in 30 days`} onClick={() => onOpen('users')} />
      </div>
      <Card title="How to enable a customer after they pay">
        <ol className="space-y-2 text-sm text-slate-700 list-decimal ps-5">
          <li><strong>Paid with the form:</strong> open <button className="font-semibold text-brand-600 hover:underline" onClick={() => onOpen('payments')}>Payments</button>, check the amount arrived in your InstaPay or Vodafone Cash, then <strong>Approve</strong>. The plan turns on immediately.</li>
          <li><strong>Paid another way</strong> (direct transfer, cash): open <button className="font-semibold text-brand-600 hover:underline" onClick={() => onOpen('users')}>Users</button>, find them, click <strong>Manage</strong>, pick the plan and duration, and save.</li>
          <li>When a plan's end date passes, the account goes back to Free automatically. Use <strong>Manage</strong> to extend it.</li>
        </ol>
      </Card>
    </div>
  );
}

function StatTile({ icon, label, value, sub, tone, onClick }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; tone?: 'amber'; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={`text-start rounded-3xl bg-white p-5 shadow-card ${onClick ? 'hover:shadow-card-hover transition-shadow' : ''}`}>
      <span className={`w-9 h-9 rounded-full flex items-center justify-center ${tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{icon}</span>
      <div className="mt-3 text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tabular-nums ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </Comp>
  );
}

function UsersPanel({ onOpenPayments }: { onOpenPayments: () => void }) {
  const notify = useToast();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [managing, setManaging] = useState<string | null>(null);

  const load = (search = q) => api.adminUsers(search.trim()).then((r) => setUsers(r.users)).catch((e) => notify('err', (e as Error).message));
  useEffect(() => { load(''); }, []);
  // Search as you type, a moment after the last key.
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name" className="pl-9" />
      </div>
      {users === null ? <RowsSkeleton rows={5} /> : users.length === 0 ? (
        <Card><EmptyState icon={<Users className="w-6 h-6" />} title="No users found" /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id}>
                <div className="px-5 py-3.5 flex items-center gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate" dir="auto">{u.name}</div>
                    <div className="text-xs text-slate-500 truncate">{u.email} · joined {fmtDate(u.createdAt)} · {u.sites} site{u.sites === 1 ? '' : 's'}{!u.linked && ' · not signed in yet'}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {u.hasPendingPayment && <button onClick={onOpenPayments}><Badge tone="amber" icon={<Clock className="w-3 h-3" />}>Payment waiting</Badge></button>}
                    <PlanBadge u={u} />
                    <Button size="sm" variant="secondary" icon={<Settings2 className="w-3.5 h-3.5" />} onClick={() => setManaging(managing === u.id ? null : u.id)}>Manage</Button>
                  </div>
                </div>
                {managing === u.id && (
                  <ManagePlan user={u} onDone={(msg) => { setManaging(null); notify('ok', msg); load(); }} onCancel={() => setManaging(null)} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-slate-400">Showing up to 200 users, newest first. Search to find others.</p>
    </div>
  );
}

function PlanBadge({ u }: { u: AdminUser }) {
  if (u.plan === 'free') {
    return u.storedPlan !== 'free' ? <Badge tone="slate">Free (ended {u.planExpiresAt ? fmtDate(u.planExpiresAt) : ''})</Badge> : <Badge tone="slate">Free</Badge>;
  }
  const left = u.planExpiresAt ? daysLeft(u.planExpiresAt) : null;
  return (
    <Badge tone={left !== null && left <= 7 ? 'amber' : 'green'}>
      {PLAN_NAMES[u.plan]} · {u.planExpiresAt ? `until ${fmtDate(u.planExpiresAt)}` : 'no end date'}
    </Badge>
  );
}

const DURATIONS: { label: string; months: number | null }[] = [
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '12 months', months: 12 },
  { label: 'No end date', months: null },
];

function ManagePlan({ user, onDone, onCancel }: { user: AdminUser; onDone: (msg: string) => void; onCancel: () => void }) {
  const notify = useToast();
  const [plan, setPlan] = useState<Plan>(user.plan === 'free' ? 'starter' : user.plan);
  const [months, setMonths] = useState<number | null>(1);
  const [busy, setBusy] = useState(false);
  const extending = plan !== 'free' && plan === user.plan && !!user.planExpiresAt && months !== null;

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.adminSetPlan(user.id, plan, plan === 'free' ? null : months);
      onDone(r.plan === 'free'
        ? `${user.email} is now on Free.`
        : `${user.email} is on ${PLAN_NAMES[r.plan]}${r.planExpiresAt ? ` until ${fmtDate(r.planExpiresAt)}` : ' with no end date'}.`);
    } catch (e) {
      notify('err', (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-5 mb-4 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 space-y-4">
      <div>
        <div className="text-xs font-semibold text-slate-700 mb-2">Plan</div>
        <div className="flex flex-wrap gap-2">
          {(['free', 'starter', 'business', 'agency'] as Plan[]).map((p) => (
            <button key={p} onClick={() => setPlan(p)} aria-pressed={plan === p}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${plan === p ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {PLAN_NAMES[p]}
            </button>
          ))}
        </div>
      </div>
      {plan !== 'free' && (
        <div>
          <div className="text-xs font-semibold text-slate-700 mb-2">{extending ? 'Add' : 'Duration'}</div>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button key={d.label} onClick={() => setMonths(d.months)} aria-pressed={months === d.months}
                className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${months === d.months ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                {d.label}
              </button>
            ))}
          </div>
          {extending && <p className="mt-2 text-xs text-slate-500">Added on top of the current end date ({fmtDate(user.planExpiresAt!)}).</p>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} loading={busy} onClick={save}>{plan === 'free' ? 'Move to Free' : 'Save plan'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

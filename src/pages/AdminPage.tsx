// Admin: review manual payments. Visible only to ADMIN_EMAILS (shared/billing.ts);
// the API enforces this too.
import { useEffect, useState } from 'react';
import { Check, ExternalLink, ImageOff, RefreshCw, X } from 'lucide-react';
import type { PaymentStatus } from '@shared/billing';
import { PLAN_NAMES } from '@shared/plans';
import { api, type AdminPayment } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Badge, Button, Card, EmptyState, PageBody, PageHeader } from '@/components/ui';
import { RowsSkeleton } from '@/components/ui/Skeleton';

const METHOD: Record<string, string> = { instapay: 'InstaPay', vodafone_cash: 'Vodafone Cash' };
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function AdminPage({ onPendingCount }: { onPendingCount?: (n: number) => void }) {
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
    <PageBody>
      <PageHeader
        title="Payments"
        desc="Check each payment in your InstaPay or Vodafone Cash account before approving. Approving activates the plan right away."
        action={<Button variant="secondary" icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />} onClick={() => load()} disabled={loading}>Refresh</Button>}
      />
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
    </PageBody>
  );
}

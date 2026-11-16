// Billing: pick a plan, pay manually by InstaPay or Vodafone Cash, submit the receipt
// details, then wait for an admin to approve (see /api/billing in server/app.ts).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, CircleCheck, Clock, Copy, CreditCard, ImagePlus, Smartphone, Wallet, X } from 'lucide-react';
import { PAID_PLANS, PAYMENT_DETAILS, PAYMENT_DETAILS_SET, priceFor, yearlySavingPct, type BillingPeriod, type PaidPlan, type PaymentMethod } from '@shared/billing';
import { formatLimit, limitsFor, PLAN_NAMES } from '@shared/plans';
import { api, type BillingInfo, type OwnPayment } from '@/lib/api';
import { useClipboard } from '@/hooks/useClipboard';
import { useToast } from '@/components/ui/Toast';
import { Alert, Badge, Button, Card, Field, PageBody, PageHeader, TextInput } from '@/components/ui';
import { RowsSkeleton } from '@/components/ui/Skeleton';
import { SUPPORT_EMAIL } from '@/landing/content';

const fmtEGP = (n: number) => `${n.toLocaleString('en-US')} EGP`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const METHOD_NAME: Record<PaymentMethod, string> = { instapay: 'InstaPay', vodafone_cash: 'Vodafone Cash' };

export function BillingPage({ initialPlan }: { initialPlan?: PaidPlan }) {
  const notify = useToast();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [plan, setPlan] = useState<PaidPlan>(initialPlan ?? 'starter');
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [method, setMethod] = useState<PaymentMethod>('instapay');
  const [sender, setSender] = useState('');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.billing().then(setInfo).catch((e) => notify('err', (e as Error).message));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (initialPlan) setPlan(initialPlan); }, [initialPlan]);

  const pending = info?.requests.find((r) => r.status === 'pending');
  const amount = priceFor(plan, period);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (sender.trim().length < 4) return setError(method === 'instapay' ? 'Enter the InstaPay address or phone number you paid from.' : 'Enter the Vodafone Cash number you paid from.');
    if (reference.trim().length < 3) return setError('Enter the transaction or reference number from your receipt.');
    const form = new FormData();
    form.append('plan', plan); form.append('period', period); form.append('method', method);
    form.append('sender', sender.trim()); form.append('reference', reference.trim());
    if (proof) form.append('proof', proof);
    setBusy(true);
    try {
      await api.submitPayment(form);
      setSender(''); setReference(''); setProof(null);
      notify('ok', "Payment submitted. We'll activate your plan after checking it.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageBody>
      <PageHeader title="Billing" desc="Upgrade by paying with InstaPay or Vodafone Cash. We activate your plan after checking the payment, usually within 24 hours." />

      {!info ? <RowsSkeleton rows={4} /> : (
        <div className="space-y-6">
          <CurrentPlan info={info} />

          {pending ? (
            <PendingCard p={pending} />
          ) : (
            <form onSubmit={submit} className="space-y-6">
              {/* 1. Plan */}
              <Card title="1 · Choose a plan" action={<PeriodToggle value={period} onChange={setPeriod} />}>
                <div className="grid gap-3 max-w-md" role="radiogroup" aria-label="Plan">
                  {PAID_PLANS.map((p) => <PlanOption key={p} plan={p} period={period} active={plan === p} onClick={() => setPlan(p)} />)}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Need more websites, or a plan for your agency? <a className="font-semibold text-brand-600 hover:text-brand-700" href={`mailto:${SUPPORT_EMAIL}?subject=Syncave%20plan`}>Contact us</a>.
                </p>
              </Card>

              {/* 2. Pay */}
              <Card title="2 · Send the payment" desc={<>Send exactly <strong className="text-slate-900">{fmtEGP(amount)}</strong> for {PLAN_NAMES[plan]} ({period === 'yearly' ? '12 months' : '1 month'}).</>}>
                <div className="grid grid-cols-2 gap-2 mb-4" role="radiogroup" aria-label="Payment method">
                  <MethodButton active={method === 'instapay'} onClick={() => setMethod('instapay')} icon={<Smartphone className="w-4 h-4" />} title="InstaPay" sub="إنستاباي" />
                  <MethodButton active={method === 'vodafone_cash'} onClick={() => setMethod('vodafone_cash')} icon={<Wallet className="w-4 h-4" />} title="Vodafone Cash" sub="فودافون كاش" />
                </div>
                {!PAYMENT_DETAILS_SET ? (
                  <Alert tone="amber" title="Payment details coming soon">
                    Online payment isn't set up yet. Email <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we'll send you the details.
                  </Alert>
                ) : method === 'instapay' ? (
                  <PayDetails
                    rows={[{ label: /@/.test(PAYMENT_DETAILS.instapay.address) ? 'InstaPay address' : 'InstaPay number', value: PAYMENT_DETAILS.instapay.address }, { label: 'Name', value: PAYMENT_DETAILS.instapay.name }, { label: 'Amount', value: String(amount), suffix: 'EGP' }].filter((r) => r.value)}
                    steps={['Open the InstaPay app and choose “Send money”.', /@/.test(PAYMENT_DETAILS.instapay.address) ? 'Choose “Payment address (IPA)” and paste the address above.' : 'Choose “Mobile number” and enter the number above.', 'Send the exact amount shown.', 'Keep the receipt: you need its reference number below.']}
                  />
                ) : (
                  <PayDetails
                    rows={[{ label: 'Vodafone Cash number', value: PAYMENT_DETAILS.vodafoneCash.number }, { label: 'Name', value: PAYMENT_DETAILS.vodafoneCash.name }, { label: 'Amount', value: String(amount), suffix: 'EGP' }].filter((r) => r.value)}
                    steps={['Open Ana Vodafone, or dial *9*7*number*amount# from your Vodafone Cash line.', 'Send the exact amount to the number above.', 'Keep the SMS or receipt: you need its transaction number below.']}
                  />
                )}
              </Card>

              {/* 3. Tell us */}
              <Card title="3 · Tell us you've paid" desc="We match these details with the payment we received.">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label={method === 'instapay' ? 'Paid from (InstaPay address or phone)' : 'Paid from (Vodafone Cash number)'} htmlFor="pay-sender">
                    <TextInput id="pay-sender" dir="ltr" value={sender} onChange={(e) => setSender(e.target.value)} placeholder={method === 'instapay' ? 'name@instapay or 01xxxxxxxxx' : '010xxxxxxxx'} inputMode={method === 'instapay' ? 'email' : 'tel'} autoComplete="off" />
                  </Field>
                  <Field label="Transaction / reference number" htmlFor="pay-ref">
                    <TextInput id="pay-ref" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="From the receipt or SMS" autoComplete="off" />
                  </Field>
                </div>
                <div className="mt-4">
                  <ProofPicker file={proof} onChange={setProof} />
                </div>
                {error && <div className="mt-4"><Alert tone="red" title="Check the details">{error}</Alert></div>}
                <div className="mt-5 flex items-center gap-3 flex-wrap">
                  <Button type="submit" icon={<CreditCard className="w-4 h-4" />} loading={busy} disabled={!PAYMENT_DETAILS_SET}>
                    {busy ? 'Submitting…' : `I've paid ${fmtEGP(amount)}`}
                  </Button>
                  <span className="text-xs text-slate-500">Your current plan stays active until the new one starts.</span>
                </div>
              </Card>
            </form>
          )}

          <History requests={info.requests} />
        </div>
      )}
    </PageBody>
  );
}

function CurrentPlan({ info }: { info: BillingInfo }) {
  const l = limitsFor(info.plan);
  const daysLeft = info.planExpiresAt ? Math.ceil((Date.parse(info.planExpiresAt) - Date.now()) / 86400000) : null;
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current plan</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{PLAN_NAMES[info.plan]}</div>
          <div className="mt-1 text-sm text-slate-500">
            {info.planExpiresAt
              ? <>Active until <strong className="text-slate-800">{fmtDate(info.planExpiresAt)}</strong>{daysLeft !== null && daysLeft <= 7 && <span className="text-amber-700"> · {daysLeft} day{daysLeft === 1 ? '' : 's'} left, renew below</span>}</>
              : info.plan === 'free' ? 'Free forever. Upgrade any time.' : 'No end date.'}
          </div>
        </div>
        <ul className="text-xs text-slate-600 space-y-1">
          <li>Websites: <strong>{formatLimit(l.sites)}</strong></li>
          <li>Questions per site: <strong>{formatLimit(l.questionsPerSite)}</strong></li>
          <li>Orders: <strong>{l.orders ? 'Included' : 'Not included'}</strong></li>
        </ul>
      </div>
    </Card>
  );
}

function PeriodToggle({ value, onChange }: { value: BillingPeriod; onChange: (p: BillingPeriod) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold" role="group" aria-label="Billing period">
      {(['monthly', 'yearly'] as BillingPeriod[]).map((p) => (
        <button key={p} type="button" onClick={() => onChange(p)} aria-pressed={value === p} className={`px-3 py-1.5 rounded-md transition-colors ${value === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          {p === 'monthly' ? 'Monthly' : <>Yearly <span className="ms-1 rounded-full bg-gold-100 px-1.5 py-px text-[10px] text-gold-800">Save {yearlySavingPct('starter')}%</span></>}
        </button>
      ))}
    </div>
  );
}

function PlanOption({ plan, period, active, onClick }: { plan: PaidPlan; period: BillingPeriod; active: boolean; onClick: () => void }) {
  const l = limitsFor(plan);
  const price = priceFor(plan, period);
  const perks = [
    `${formatLimit(l.sites)} website${l.sites === 1 ? '' : 's'}`,
    'Unlimited questions',
    `Order collection (${formatLimit(l.ordersKept)} kept per site)`,
    'Your logo, colors and background',
  ];
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      className={`text-start rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] ${active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold text-slate-900">{PLAN_NAMES[plan]}</span>
        {active && <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center"><Check className="w-3 h-3" /></span>}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{price.toLocaleString('en-US')} <span className="text-sm font-medium text-slate-500">EGP / {period === 'yearly' ? 'year' : 'month'}</span></div>
      <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
        {perks.map((p) => <li key={p} className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-brand-600 mt-px shrink-0" />{p}</li>)}
      </ul>
    </button>
  );
}

function MethodButton({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start transition-colors ${active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{icon}</span>
      <span><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="block text-[11px] text-slate-500" dir="rtl">{sub}</span></span>
    </button>
  );
}

function PayDetails({ rows, steps }: { rows: { label: string; value: string; suffix?: string }[]; steps: string[] }) {
  const { copied, copy } = useClipboard();
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.label} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500">{r.label}</div>
              <div className="font-mono text-sm font-semibold text-slate-900 truncate" dir="ltr">{r.value}{r.suffix && <span className="font-sans font-medium text-slate-500"> {r.suffix}</span>}</div>
            </div>
            <button type="button" onClick={() => copy(r.value, r.label)} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              {copied === r.label ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </button>
          </div>
        ))}
      </div>
      <ol className="space-y-2.5 text-sm text-slate-700">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5"><span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[11px] font-semibold flex items-center justify-center shrink-0 mt-px">{i + 1}</span><span>{s}</span></li>
        ))}
      </ol>
    </div>
  );
}

function ProofPicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div>
      <div className="text-xs font-semibold text-slate-700 mb-1.5">Receipt screenshot <span className="font-normal text-slate-400">(recommended, speeds up approval)</span></div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5 * 1024 * 1024) { alert('Please choose an image under 5 MB.'); return; } onChange(f); e.target.value = ''; }} />
      {file && preview ? (
        <div className="flex items-center gap-3">
          <img src={preview} alt="Receipt preview" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
          <div className="text-xs text-slate-600 min-w-0"><div className="truncate font-medium">{file.name}</div><div>{(file.size / 1024).toFixed(0)} KB</div></div>
          <button type="button" onClick={() => onChange(null)} className="ms-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Remove receipt"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} className="w-full rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-700 inline-flex items-center justify-center gap-2">
          <ImagePlus className="w-4 h-4" /> Upload a screenshot (PNG or JPG, max 5 MB)
        </button>
      )}
    </div>
  );
}

function PendingCard({ p }: { p: OwnPayment }) {
  return (
    <Alert tone="amber" icon={<Clock className="w-5 h-5 text-amber-600" />} title="Payment under review">
      We received your {METHOD_NAME[p.method]} payment details for <strong>{PLAN_NAMES[p.plan]}</strong> ({p.period}, {fmtEGP(p.amountEgp)}) on {fmtDate(p.createdAt)}.
      We'll activate your plan as soon as we confirm it, usually within 24 hours. Reference: <span className="font-mono">{p.reference}</span>.
    </Alert>
  );
}

function History({ requests }: { requests: OwnPayment[] }) {
  if (!requests.length) return null;
  return (
    <Card title="Payment history" className="!p-0 overflow-hidden">
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {requests.map((r) => (
          <li key={r.id} className="px-5 sm:px-6 py-3 flex items-start gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{PLAN_NAMES[r.plan]} · {r.period === 'yearly' ? 'Yearly' : 'Monthly'} · {fmtEGP(r.amountEgp)}</div>
              <div className="text-xs text-slate-500">{METHOD_NAME[r.method]} · ref <span className="font-mono">{r.reference}</span> · {fmtDate(r.createdAt)}</div>
              {r.status === 'rejected' && r.note && <div className="mt-1 text-xs text-red-700">Reason: {r.note}</div>}
            </div>
            {r.status === 'approved' ? <Badge tone="green" icon={<CircleCheck className="w-3 h-3" />}>Approved</Badge>
              : r.status === 'rejected' ? <Badge tone="red">Rejected</Badge>
              : <Badge tone="amber">Pending</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}


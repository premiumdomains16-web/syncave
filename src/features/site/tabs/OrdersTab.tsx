import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Download, Mail, RefreshCw } from 'lucide-react';
import type { Bot, Order } from '@shared/types';
import { api } from '@/lib/api';
import { isNativeApp } from '@/lib/native';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Alert, Button, Card, EmptyState, SectionHeader } from '@/components/ui';
import { RowsSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { PlanNotice, UpgradeLink, UsageMeter, usePlan } from '@/components/PlanLock';

const PAGE = 50;

/** Orders are fetched per page from the server; the bot only carries the count. */
export function OrdersTab({ bot, onCount }: { bot: Bot; onCount: (n: number) => void }) {
  const notify = useToast();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [total, setTotal] = useState(bot.orderCount);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (offset: number) => {
    const page = await api.orders(bot.id, { limit: PAGE, offset });
    setTotal(page.total);
    onCount(page.total);
    setOrders((prev) => (offset === 0 || !prev ? page.orders : [...prev, ...page.orders]));
  }, [bot.id, onCount]);

  const refresh = async () => {
    setLoading(true);
    try { await load(0); } catch (e) { notify('err', (e as Error).message); } finally { setLoading(false); }
  };
  const loadMore = async () => {
    setMore(true);
    try { await load(orders?.length ?? 0); } catch (e) { notify('err', (e as Error).message); } finally { setMore(false); }
  };

  // Orders arrive from the live widget, so fetch fresh ones whenever the tab opens.
  useEffect(() => { setOrders(null); refresh(); }, [bot.id]);

  const ordersLive = bot.published?.enableOrders;
  const { plan, limits, name: planName } = usePlan();
  const kept = limits.ordersKept;
  const nearCap = kept !== null && kept > 0 && total >= kept * 0.8;

  return (
    <div className="space-y-4 max-w-4xl">
      <SectionHeader
        title="Orders"
        desc="Orders visitors submit through the chat."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />} onClick={refresh} disabled={loading}>Refresh</Button>
            {total > 0 && !isNativeApp && (
              <Button icon={<Download className="w-4 h-4" />} onClick={() => api.downloadOrdersCsv(bot.id).catch((e) => notify('err', (e as Error).message))}>
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      {!limits.orders && (
        <PlanNotice plan={plan} need={(l) => l.orders} title={`Order collection isn't included in the ${planName} plan.`}>
          Orders already received stay here and can be exported, but the chat won't accept new ones until you upgrade.
        </PlanNotice>
      )}

      {kept !== null && kept > 0 && (
        <div className={`rounded-xl border p-4 flex items-center gap-4 flex-wrap ${nearCap ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200/80 bg-white shadow-card'}`}>
          <div className="flex-1 min-w-[12rem]"><UsageMeter used={total} limit={kept} label={`Orders stored (${planName} plan)`} /></div>
          <p className="text-xs text-slate-600 max-w-sm">
            {nearCap ? 'You’re close to the cap — once it’s reached, the oldest orders are removed as new ones arrive. ' : 'When the cap is reached, the oldest orders are removed as new ones arrive. '}
            Export to CSV to keep a copy, or <UpgradeLink className="text-xs">upgrade for more</UpgradeLink>.
          </p>
        </div>
      )}

      {!ordersLive && (
        <Alert tone="amber" title="Orders aren't live yet">
          You've enabled orders in your draft. Publish to show the “Place an order” option to visitors.
        </Alert>
      )}

      {orders === null ? (
        <RowsSkeleton rows={4} />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {orders.length === 0 ? (
            <EmptyState icon={<Mail className="w-6 h-6" />} title="No orders yet" desc="Orders submitted by visitors will appear here." />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-left">
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5 hidden md:table-cell">Phone</th>
                    <th className="px-4 py-2.5 hidden lg:table-cell">Message</th>
                    <th className="px-4 py-2.5 text-right">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50 align-top cursor-pointer" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900" dir="auto">{o.name}</div>
                        <a href={`mailto:${o.email}`} onClick={(e) => e.stopPropagation()} className="text-xs text-brand-600 hover:underline">{o.email}</a>
                        {expanded === o.id && o.message && <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap lg:hidden" dir="auto">{o.message}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate-600 text-xs">
                        {o.phone ? <a href={`tel:${o.phone}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{o.phone}</a> : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-600 text-xs max-w-sm">
                        <p className={expanded === o.id ? 'whitespace-pre-wrap' : 'truncate'} dir="auto">{o.message || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs text-right whitespace-nowrap" title={formatDateTime(o.timestamp)}>{timeAgo(o.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {orders.length < total && (
                <div className="border-t border-slate-100 p-2 text-center">
                  <Button variant="ghost" size="sm" icon={<ChevronDown className="w-3.5 h-3.5" />} loading={more} onClick={loadMore}>
                    Show more ({total - orders.length} left)
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}
      {total > 0 && <p className="text-xs text-slate-400">{total} order{total === 1 ? '' : 's'} · click a row to read the full message.</p>}
    </div>
  );
}

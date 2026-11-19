import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Download, Mail, MapPin, MessageCircle, Phone, RefreshCw } from 'lucide-react';
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
/** wa.me needs the international number without + or leading zeros; Egyptian 01xxxxxxxxx → 201xxxxxxxxx. */
function whatsappNumber(phone: string): string | null {
  let d = phone.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  else if (/^01\d{9}$/.test(d)) d = '2' + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export function OrdersTab({ bot, onCount }: { bot: Bot; onCount: (n: number) => void }) {
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    try { await api.downloadOrdersExcel(bot.id); }
    catch (e) { notify('err', (e as Error).message); }
    finally { setExporting(false); }
  };
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
              <Button icon={<Download className="w-4 h-4" />} loading={exporting} onClick={exportExcel}>
                Export to Excel
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
            Export to Excel to keep a copy, or <UpgradeLink className="text-xs">upgrade for more</UpgradeLink>.
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
      ) : orders.length === 0 ? (
        <Card className="!p-0 overflow-hidden">
          <EmptyState icon={<Mail className="w-6 h-6" />} title="No orders yet" desc="Orders submitted by visitors will appear here." />
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const wa = whatsappNumber(o.phone);
            return (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900" dir="auto">{o.name}</div>
                    <div className="text-xs text-slate-500" title={formatDateTime(o.timestamp)}>{timeAgo(o.timestamp)} · {formatDateTime(o.timestamp)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {o.phone && (
                      <a href={`tel:${o.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <Phone className="w-3.5 h-3.5" /> <span dir="ltr">{o.phone}</span>
                      </a>
                    )}
                    {wa && (
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95">
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    )}
                    {o.email && (
                      <a href={`mailto:${o.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <Mail className="w-3.5 h-3.5" /> Email
                      </a>
                    )}
                  </div>
                </div>
                {o.address && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                    <MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" /><span dir="auto">{o.address}</span>
                  </div>
                )}
                {o.message && (
                  <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 whitespace-pre-wrap" dir="auto">{o.message}</div>
                )}
              </Card>
            );
          })}
          {orders.length < total && (
            <div className="text-center">
              <Button variant="ghost" size="sm" icon={<ChevronDown className="w-3.5 h-3.5" />} loading={more} onClick={loadMore}>
                Show more ({total - orders.length} left)
              </Button>
            </div>
          )}
        </div>
      )}
      {total > 0 && <p className="text-xs text-slate-400">{total} order{total === 1 ? '' : 's'}{isNativeApp ? ' · export to Excel from the website' : ''}</p>}
    </div>
  );
}

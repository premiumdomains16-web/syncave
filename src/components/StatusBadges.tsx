import { CircleAlert, CircleCheck } from 'lucide-react';
import type { Bot } from '@shared/types';
import { timeAgo } from '@/lib/format';
import { Badge } from '@/components/ui';

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified
    ? <Badge tone="green" icon={<CircleCheck className="w-3 h-3" />}>Verified</Badge>
    : <Badge tone="amber" icon={<CircleAlert className="w-3 h-3" />}>Unverified</Badge>;
}

/** One-line summary of where a bot is in the verify → publish lifecycle. */
export function PublishStatus({ bot, dirty }: { bot: Bot; dirty: boolean }) {
  if (!bot.verified) return <Badge tone="amber" icon={<CircleAlert className="w-3 h-3" />}>Verify domain to publish</Badge>;
  if (!bot.published) return <Badge tone="slate">Not published yet</Badge>;
  if (dirty) return <Badge tone="amber">Unpublished changes</Badge>;
  return <Badge tone="green" icon={<CircleCheck className="w-3 h-3" />}>Live · published {timeAgo(bot.lastPublished)}</Badge>;
}

export function StatusDot({ bot }: { bot: Bot }) {
  const color = !bot.verified ? 'bg-amber-400' : bot.published ? 'bg-green-500' : 'bg-slate-300';
  const label = !bot.verified ? 'Unverified' : bot.published ? 'Live' : 'Verified, not published';
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} title={label} />;
}

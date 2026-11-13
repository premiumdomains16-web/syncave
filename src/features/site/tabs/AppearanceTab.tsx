import { useRef, useState } from 'react';
import { ImageIcon, Lock, Upload } from 'lucide-react';
import type { Bot, BotPatch } from '@shared/types';
import { Button, Card, SectionHeader, TextArea, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { PlanLockBadge, PlanNotice, UpgradeLink, usePlan } from '@/components/PlanLock';

const THEME_COLORS = ['#157a6e', '#f4621f', '#1f33d6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#0f172a'];

type ImageField = 'logoUrl' | 'backgroundImageUrl';

interface Props {
  bot: Bot;
  onUpdate: (patch: BotPatch) => void;
  onUpload: (field: ImageField, file: File) => Promise<void>;
}

export function AppearanceTab({ bot, onUpdate, onUpload }: Props) {
  const { plan, limits, name: planName } = usePlan();
  const needBranding = (l: { branding: boolean }) => l.branding;
  const needOrders = (l: { orders: boolean }) => l.orders;

  return (
    <div className="space-y-5 max-w-2xl">
      <SectionHeader
        title="Appearance & messages"
        desc="Customize how the chatbot looks and what it says. Changes appear in the preview immediately and go live when you publish."
      />

      <Card title="Welcome message" desc="The first message visitors see when they open the chat.">
        <TextArea rows={2} value={bot.welcomeMessage} onChange={(e) => onUpdate({ welcomeMessage: e.target.value })} dir="auto" />
      </Card>

      <Card title="Fallback message" desc="Shown when a typed question doesn't match any of your Q&A pairs. Point people to a next step.">
        <TextArea rows={2} value={bot.fallbackMessage} onChange={(e) => onUpdate({ fallbackMessage: e.target.value })} dir="auto" />
      </Card>

      <Card title="Theme color" desc="Used for the chat bubble, header, suggestion chips and outgoing messages.">
        <div className="flex items-center gap-2 flex-wrap">
          {THEME_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ themeColor: c })}
              className={`w-8 h-8 rounded-full transition-all ring-offset-2 ${bot.themeColor === c ? 'ring-2 ring-slate-900 scale-105' : 'hover:scale-110'}`}
              style={{ background: c }}
              aria-label={`Use color ${c}`}
              aria-pressed={bot.themeColor === c}
            />
          ))}
          <label className="relative w-8 h-8 rounded-full border-2 border-dashed border-slate-300 hover:border-slate-400 cursor-pointer overflow-hidden" title="Custom color">
            <input
              type="color"
              value={bot.themeColor}
              onChange={(e) => onUpdate({ themeColor: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Custom color"
            />
            <span className="absolute inset-1 rounded-full" style={{ background: THEME_COLORS.includes(bot.themeColor) ? 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' : bot.themeColor }} />
          </label>
          <span className="ml-2 font-mono text-xs text-slate-500 uppercase">{bot.themeColor}</span>
        </div>
      </Card>

      {!limits.branding && (
        <PlanNotice plan={plan} need={needBranding} title={`Your logo and background image are part of the Starter plan.`}>
          The {planName} plan uses the default chat avatar and shows a small “Powered by Syncave” label.
        </PlanNotice>
      )}

      <Card
        title={<span className="inline-flex items-center gap-2">Logo {!limits.branding && <PlanLockBadge plan={plan} need={needBranding} />}</span>}
        desc="Shown as the bot's avatar in the chat header and next to replies. Square images work best."
      >
        {limits.branding
          ? <ImageUpload value={bot.logoUrl} shape="square" label="logo" maxMB={limits.uploadMB} onUpload={(f) => onUpload('logoUrl', f)} onRemove={() => onUpdate({ logoUrl: null })} />
          : <LockedUpload shape="square" value={bot.logoUrl} onRemove={() => onUpdate({ logoUrl: null })} />}
      </Card>

      <Card
        title={<span className="inline-flex items-center gap-2">Background image {!limits.branding && <PlanLockBadge plan={plan} need={needBranding} />}</span>}
        desc="A subtle backdrop behind the conversation. Busy photos can hurt readability."
      >
        {limits.branding
          ? <ImageUpload value={bot.backgroundImageUrl} shape="wide" label="background" maxMB={limits.uploadMB} onUpload={(f) => onUpload('backgroundImageUrl', f)} onRemove={() => onUpdate({ backgroundImageUrl: null })} />
          : <LockedUpload shape="wide" value={bot.backgroundImageUrl} onRemove={() => onUpdate({ backgroundImageUrl: null })} />}
      </Card>

      <Card
        title={<span className="inline-flex items-center gap-2">Orders {!limits.orders && <PlanLockBadge plan={plan} need={needOrders} />}</span>}
        desc="Adds a “Place an order” option that collects name, email, phone and a message. Submissions show up in the Orders tab."
      >
        {limits.orders ? (
          <Toggle checked={bot.enableOrders} onChange={(v) => onUpdate({ enableOrders: v })} label="Let visitors place orders in the chat" />
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 text-sm text-slate-500"><Lock className="w-4 h-4 text-slate-400" /> Order collection is included from Starter.</span>
            {bot.enableOrders
              ? <Button size="sm" variant="secondary" onClick={() => onUpdate({ enableOrders: false })}>Turn off orders</Button>
              : <UpgradeLink className="text-xs" />}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Shown in place of the uploader on plans without branding; still lets owners remove an existing image. */
function LockedUpload({ shape, value, onRemove }: { shape: 'square' | 'wide'; value: string | null; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className={`${shape === 'square' ? 'w-16 h-16' : 'w-28 h-16'} rounded-lg border border-dashed border-slate-300 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0`}>
        {value ? <img src={value} alt="" className="w-full h-full object-cover opacity-60" /> : <Lock className="w-4 h-4 text-slate-400" />}
      </div>
      <div className="text-xs text-slate-500">
        {value ? <>This image was added on a higher plan and won't publish. <button onClick={onRemove} className="font-semibold text-red-600 hover:text-red-700">Remove it</button></> : <UpgradeLink className="text-xs">Upgrade to upload</UpgradeLink>}
      </div>
    </div>
  );
}

function ImageUpload({ value, shape, label, maxMB, onUpload, onRemove }: {
  value: string | null; shape: 'square' | 'wide'; label: string; maxMB: number;
  onUpload: (file: File) => Promise<void>; onRemove: () => void;
}) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('err', 'Please choose an image file.');
    if (file.size > maxMB * 1024 * 1024) return notify('err', `That image is larger than ${maxMB} MB.`);
    setBusy(true);
    try {
      await onUpload(file);
    } catch (e) {
      notify('err', (e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className={`${shape === 'square' ? 'w-16 h-16' : 'w-28 h-16'} rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0`}>
        {value ? <img src={value} alt={`Current ${label}`} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-slate-300" />}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="secondary" icon={<Upload className="w-4 h-4" />} loading={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : value ? 'Replace' : `Upload ${label}`}
        </Button>
        {value && <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onRemove}>Remove</Button>}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      </div>
      <span className="text-[11px] text-slate-400 hidden sm:block">PNG, JPG, GIF or WebP · max {maxMB} MB</span>
    </div>
  );
}

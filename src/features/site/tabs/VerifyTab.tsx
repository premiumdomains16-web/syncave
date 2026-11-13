import { useState } from 'react';
import { ArrowRight, Shield } from 'lucide-react';
import type { Bot } from '@shared/types';
import { verificationMetaTag } from '@/lib/api';
import { useClipboard } from '@/hooks/useClipboard';
import { Alert, Button, Card, CodeBlock, InlineCode, SectionHeader } from '@/components/ui';

export function VerifyTab({ bot, onVerify, onNext }: { bot: Bot; onVerify: () => Promise<void>; onNext: () => void }) {
  const { copied, copy } = useClipboard();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const metaTag = verificationMetaTag(bot.verificationToken);

  const verify = async () => {
    setBusy(true); setResult(null);
    try {
      await onVerify();
      setResult({ ok: true, text: 'Verified! You can now publish your chatbot.' });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <SectionHeader title="Verify domain ownership" desc={<>Confirm you own <span className="font-mono text-slate-700">{bot.url}</span> before publishing.</>} />

      {bot.verified ? (
        <Alert tone="green" title="Domain verified" action={<Button size="sm" variant="secondary" onClick={onNext}>Edit Q&A <ArrowRight className="w-3.5 h-3.5" /></Button>}>
          You can publish your chatbot to the live site. You can remove the meta tag later if you like — verification is kept.
        </Alert>
      ) : (
        <>
          <Card title="1 · Copy your verification tag">
            <CodeBlock code={metaTag} tone="amber" onCopy={() => copy(metaTag, 'meta')} copied={copied === 'meta'} />
          </Card>

          <Card title={<>2 · Paste it inside your homepage's <InlineCode>&lt;head&gt;</InlineCode></>}>
            <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 overflow-x-auto">
{`<html>
  <head>
    ...
    `}<mark className="bg-amber-100 text-amber-900 rounded px-0.5">{metaTag}</mark>{`
  </head>
  ...
</html>`}
            </pre>
            <p className="text-xs text-slate-500 mt-3">
              Using a site builder? Look for a setting called “Custom code”, “Header code” or “SEO → meta tags”.
            </p>
          </Card>

          <Card title="3 · Publish your site, then verify" desc={<>We'll fetch <span className="font-mono">{bot.url}</span> and look for the tag. It must be publicly reachable — not behind a login or maintenance page.</>}>
            <Button icon={<Shield className="w-4 h-4" />} loading={busy} onClick={verify}>
              {busy ? 'Checking…' : 'Verify ownership'}
            </Button>
            {result && (
              <div className="mt-4">
                <Alert tone={result.ok ? 'green' : 'red'} title={result.ok ? 'Verified' : "Couldn't verify yet"}>{result.text}</Alert>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

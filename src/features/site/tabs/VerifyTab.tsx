import { useState, type ReactNode } from 'react';
import { ArrowRight, Code2, Globe, Network, Shield } from 'lucide-react';
import type { Bot } from '@shared/types';
import { embedSnippet, verificationDnsRecord, verificationMetaTag, type VerifyMethod } from '@/lib/api';
import { hostname } from '@/lib/format';
import { useClipboard } from '@/hooks/useClipboard';
import { Alert, Button, Card, CodeBlock, InlineCode, SectionHeader } from '@/components/ui';

const METHOD_LABEL: Record<VerifyMethod, string> = {
  meta: 'the verification tag',
  snippet: 'the chat script on your site',
  dns: 'your DNS record',
};

type Way = 'meta' | 'snippet' | 'dns';

export function VerifyTab({ bot, onVerify, onNext }: { bot: Bot; onVerify: () => Promise<VerifyMethod | undefined>; onNext: () => void }) {
  const { copied, copy } = useClipboard();
  const [busy, setBusy] = useState(false);
  const [way, setWay] = useState<Way>('meta');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const metaTag = verificationMetaTag(bot.verificationToken);
  const snippet = embedSnippet(bot.id);
  const dnsValue = verificationDnsRecord(bot.verificationToken);
  const host = hostname(bot.url);
  const dnsHost = host.startsWith('www.') ? host.slice(4) : host;

  const verify = async () => {
    setBusy(true); setResult(null);
    try {
      const method = await onVerify();
      setResult({ ok: true, text: `Verified using ${method ? METHOD_LABEL[method] : 'your site'}. You can now publish your chatbot.` });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <SectionHeader title="Verify domain ownership" desc={<>Confirm you own <span className="font-mono text-slate-700">{host}</span> before publishing. Pick whichever way is easiest; any one works.</>} />

      {bot.verified ? (
        <Alert tone="green" title="Domain verified" action={<Button size="sm" variant="secondary" onClick={onNext}>Edit Q&A <ArrowRight className="w-3.5 h-3.5" /></Button>}>
          You can publish your chatbot to the live site. You can remove the tag or DNS record later if you like; verification is kept.
        </Alert>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Verification method">
            <WayButton active={way === 'meta'} onClick={() => setWay('meta')} icon={<Code2 className="w-4 h-4" />} title="Meta tag" hint="Recommended" />
            <WayButton active={way === 'snippet'} onClick={() => setWay('snippet')} icon={<Globe className="w-4 h-4" />} title="Chat script" hint="One paste does both" />
            <WayButton active={way === 'dns'} onClick={() => setWay('dns')} icon={<Network className="w-4 h-4" />} title="DNS record" hint="Any site builder" />
          </div>

          {way === 'meta' && (
            <Card title="Add this tag to your homepage" desc={<>Inside <InlineCode>&lt;head&gt;</InlineCode> is best. If your builder only allows code in the page body, that works too.</>}>
              <CodeBlock code={metaTag} tone="amber" onCopy={() => copy(metaTag, 'meta')} copied={copied === 'meta'} />
              <pre className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-700 overflow-x-auto">
{`<html>
  <head>
    ...
    `}<mark className="bg-amber-100 text-amber-900 rounded px-0.5">{metaTag}</mark>{`
  </head>
  ...
</html>`}
              </pre>
              <p className="text-xs text-slate-500 mt-3">
                Using a site builder? Look for “Custom code”, “Header code”, or “SEO → meta tags”.
              </p>
            </Card>
          )}

          {way === 'snippet' && (
            <Card title="Install the chat script on your homepage" desc="This script shows the chat on your site, and it also proves the site is yours. Paste it once and you're done with both steps.">
              <CodeBlock code={snippet} onCopy={() => copy(snippet, 'snippet')} copied={copied === 'snippet'} />
              <p className="text-xs text-slate-500 mt-3">
                Paste it just before <InlineCode>&lt;/body&gt;</InlineCode> (or in your builder's “Footer code” / “Custom code” setting). The chat stays hidden until you publish.
              </p>
            </Card>
          )}

          {way === 'dns' && (
            <Card title="Add a TXT record to your domain" desc="Works with any website builder, and when your site blocks automated checks. Add it where you manage your domain (GoDaddy, Namecheap, Cloudflare, …).">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="font-medium pb-2 pe-4">Type</th>
                      <th className="font-medium pb-2 pe-4">Name / Host</th>
                      <th className="font-medium pb-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="align-top">
                      <td className="pe-4 py-1 font-mono">TXT</td>
                      <td className="pe-4 py-1"><span className="font-mono">@</span><div className="text-[11px] text-slate-500">({dnsHost})</div></td>
                      <td className="py-1"><InlineCode>{dnsValue}</InlineCode></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-3"><Button size="sm" variant="secondary" onClick={() => copy(dnsValue, 'dns')}>{copied === 'dns' ? 'Copied' : 'Copy value'}</Button></div>
              <p className="text-xs text-slate-500 mt-3">DNS changes can take from a few minutes up to a few hours to show up. If verifying fails at first, try again later.</p>
            </Card>
          )}

          <Card title="Then verify" desc={<>We'll check <span className="font-mono">{bot.url}</span> and your domain's DNS. Your homepage must be public: not behind a login or a maintenance page.</>}>
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

function WayButton({ active, onClick, icon, title, hint }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; hint: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-start transition-colors ${
        active ? 'border-brand-500 bg-brand-50/70 ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
    </button>
  );
}

import { useState } from 'react';
import type { Bot } from '@shared/types';
import { api, embedSnippet, SITE_HOST, type InstallStatus } from '@/lib/api';
import { useClipboard } from '@/hooks/useClipboard';
import { Alert, Button, Card, CodeBlock, InlineCode, SectionHeader } from '@/components/ui';
import { ExternalLink, Rocket, ScanSearch } from 'lucide-react';

interface Props {
  bot: Bot;
  dirty: boolean;
  publishing: boolean;
  onPublish: () => void;
  onGoVerify: () => void;
}

export function EmbedTab({ bot, dirty, publishing, onPublish, onGoVerify }: Props) {
  const { copied, copy } = useClipboard();
  const snippet = embedSnippet(bot.id);
  const isLive = !!bot.published;
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<InstallStatus | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const check = async () => {
    setChecking(true); setStatus(null); setCheckError(null);
    try { setStatus(await api.installStatus(bot.id)); }
    catch (e) { setCheckError((e as Error).message); }
    finally { setChecking(false); }
  };

  // What the check found, in plain words.
  const mine = status?.scripts.filter((s) => s.botId === bot.id) ?? [];
  const others = status?.scripts.filter((s) => s.botId !== bot.id) ?? [];
  const wrongHost = mine.filter((s) => s.host !== SITE_HOST);

  return (
    <div className="space-y-5 max-w-3xl">
      <SectionHeader title="Install on your site" desc="Paste this snippet into your site's HTML — the chat bubble appears in the bottom-right corner." />

      {!bot.verified && (
        <Alert tone="amber" title="Verify your domain first" action={<Button size="sm" variant="secondary" onClick={onGoVerify}>Go to Verify →</Button>}>
          The widget won't load on your site until you verify ownership and publish at least once.
        </Alert>
      )}
      {bot.verified && !isLive && (
        <Alert tone="indigo" icon={<Rocket className="w-5 h-5 text-brand-600" />} title="Ready to go live"
          action={<Button size="sm" loading={publishing} onClick={onPublish}>Publish now</Button>}>
          Publish your draft to make the widget work on your site.
        </Alert>
      )}
      {isLive && dirty && (
        <Alert tone="amber" title="You have unpublished changes" action={<Button size="sm" loading={publishing} onClick={onPublish}>Publish</Button>}>
          Visitors still see your previously published version until you publish again.
        </Alert>
      )}
      {isLive && !dirty && (
        <Alert tone="green" title="Your widget is live">
          The snippet below serves the version you published. Edits stay private until you publish again.
        </Alert>
      )}

      <Card title="Embed snippet" desc={<>Place it just before the closing <InlineCode>&lt;/body&gt;</InlineCode> tag on every page where the chat should appear.</>}>
        <CodeBlock code={snippet} onCopy={() => copy(snippet, 'embed')} copied={copied === 'embed'} />
      </Card>

      <Card title="Check installation" desc={<>We'll look at <span className="font-mono">{bot.url}</span> and tell you whether the snippet is there and correct.</>}>
        <Button variant="secondary" icon={<ScanSearch className="w-4 h-4" />} loading={checking} onClick={check}>
          {checking ? 'Checking…' : 'Check my site'}
        </Button>
        {checkError && <div className="mt-4"><Alert tone="red" title="Couldn't check your site">{checkError}</Alert></div>}
        {status && (
          <div className="mt-4 space-y-3">
            {mine.length > 0 && wrongHost.length === 0 && (
              <Alert tone="green" title="Snippet installed">
                Found on your homepage.{' '}
                {isLive ? 'Refresh your site to see the chat bubble.' : 'The chat appears once you publish.'}
              </Alert>
            )}
            {wrongHost.length > 0 && (
              <Alert tone="amber" title="Snippet uses an old address">
                Your site loads the chat from <InlineCode>{wrongHost[0].host}</InlineCode>, but it should load from <InlineCode>{SITE_HOST}</InlineCode>. Replace it with the snippet above.
              </Alert>
            )}
            {mine.length === 0 && others.length > 0 && (
              <Alert tone="amber" title="Found a snippet for a different site">
                The chat script on your homepage belongs to another site in your account (id <InlineCode>{others[0].botId}</InlineCode>). Replace it with the snippet above.
              </Alert>
            )}
            {mine.length === 0 && others.length === 0 && (
              <Alert tone="red" title="Snippet not found">
                We couldn't find the chat script on your homepage. Make sure you saved and published your site after pasting it. If your site builder adds code with JavaScript, it may not show up in our check, but can still work in a browser.
              </Alert>
            )}
          </div>
        )}
      </Card>

      <Card title="Where to put it">
        <ol className="space-y-3 text-sm text-slate-700">
          {[
            <>Open your website's HTML template (or your site builder's “custom code” / “footer scripts” setting).</>,
            <>Paste the snippet immediately before <InlineCode>&lt;/body&gt;</InlineCode>.</>,
            <>Save and publish your site, then refresh it — the chat bubble appears bottom-right.</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="pt-0.5">{step}</div>
            </li>
          ))}
        </ol>
        <a href={bot.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
          Open {bot.url} <ExternalLink className="w-3 h-3" />
        </a>
      </Card>
    </div>
  );
}

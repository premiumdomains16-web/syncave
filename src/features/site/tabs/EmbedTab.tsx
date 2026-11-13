import type { Bot } from '@shared/types';
import { embedSnippet } from '@/lib/api';
import { useClipboard } from '@/hooks/useClipboard';
import { Alert, Button, Card, CodeBlock, InlineCode, SectionHeader } from '@/components/ui';
import { ExternalLink, Rocket } from 'lucide-react';

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

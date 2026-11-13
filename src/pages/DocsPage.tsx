import type { ReactNode } from 'react';
import { ArrowRight, Code, GitBranch, HelpCircle, LifeBuoy, Palette, Rocket, ShoppingBag } from 'lucide-react';
import { Button, InlineCode, PageBody, PageHeader } from '@/components/ui';

const SECTIONS = [
  { id: 'start', title: 'Getting started', icon: <Rocket className="w-4 h-4" /> },
  { id: 'drafts', title: 'Drafts vs published', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'qa', title: 'Writing good Q&A', icon: <HelpCircle className="w-4 h-4" /> },
  { id: 'embed', title: 'Embedding the widget', icon: <Code className="w-4 h-4" /> },
  { id: 'custom', title: 'Customization', icon: <Palette className="w-4 h-4" /> },
  { id: 'orders', title: 'Orders', icon: <ShoppingBag className="w-4 h-4" /> },
  { id: 'trouble', title: 'Troubleshooting', icon: <LifeBuoy className="w-4 h-4" /> },
];

export function DocsPage({ onContact }: { onContact: () => void }) {
  const jump = (id: string) => document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <PageBody width="max-w-5xl">
      <PageHeader title="Documentation" desc="Everything you need to set up Syncave on your website." />

      <div className="lg:grid lg:grid-cols-[180px_1fr] lg:gap-8">
        <nav className="hidden lg:block sticky top-8 self-start" aria-label="On this page">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">On this page</div>
          <ul className="space-y-1 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}><button onClick={() => jump(s.id)} className="block w-full text-left px-2 py-1 -mx-2 rounded-md text-slate-600 hover:text-brand-700 hover:bg-brand-50 transition-colors">{s.title}</button></li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl">
          <DocSection id="start">
            <ol className="space-y-2 list-decimal list-inside marker:text-slate-400">
              <li><strong className="text-slate-900">Add a site.</strong> Click <em>Add site</em>, enter your homepage URL and pick a template. We create a draft chatbot for you.</li>
              <li><strong className="text-slate-900">Write Q&A pairs.</strong> Add the questions visitors typically ask and the answers the bot should give. Test them in the preview panel.</li>
              <li><strong className="text-slate-900">Verify your domain.</strong> Add a small meta tag to your site's <InlineCode>&lt;head&gt;</InlineCode> so we know you own it.</li>
              <li><strong className="text-slate-900">Publish.</strong> Click <em>Publish</em> in the site header (or press <InlineCode>Ctrl</InlineCode>+<InlineCode>S</InlineCode>).</li>
              <li><strong className="text-slate-900">Embed.</strong> Paste the snippet from the <em>Embed</em> tab into your site, just before <InlineCode>&lt;/body&gt;</InlineCode>.</li>
            </ol>
          </DocSection>

          <DocSection id="drafts">
            <p>Every change you make is saved automatically as a <strong>draft</strong>. The widget on your live site keeps showing the last <strong>published</strong> version until you publish again.</p>
            <ul className="mt-2 space-y-1 list-disc list-inside marker:text-slate-400">
              <li>The dashboard preview always shows your <strong>draft</strong> — test there before going live.</li>
              <li><strong>Publish</strong> snapshots the draft and serves it to visitors.</li>
              <li><strong>Discard</strong> throws away unpublished changes and reverts to the live version.</li>
              <li>Publishing requires a verified domain.</li>
            </ul>
          </DocSection>

          <DocSection id="qa">
            <ul className="space-y-2 list-disc list-inside marker:text-slate-400">
              <li><strong>Use natural questions.</strong> Write them the way a visitor would ask: <em>“How do I cancel my plan?”</em> rather than <em>“Cancellation policy”</em>.</li>
              <li><strong>Cover variations.</strong> The matcher uses keyword overlap, not synonyms — add separate pairs for common phrasings.</li>
              <li><strong>Keep answers short.</strong> 1–3 sentences is ideal. Markdown works: <InlineCode>**bold**</InlineCode>, <InlineCode>*italic*</InlineCode>, <InlineCode>[link](https://…)</InlineCode>.</li>
              <li><strong>Check the Unanswered tab.</strong> Every question a visitor typed on your live site that got the fallback is listed there, grouped and counted — click <em>Add as Q&A</em> to answer it.</li>
              <li><strong>Order matters.</strong> Every question shows as a suggestion chip, in the order of your list; once a visitor asks one it disappears from the chips. Put the most-asked first using the ↑ ↓ buttons.</li>
            </ul>
          </DocSection>

          <DocSection id="embed">
            <p>Copy the snippet from the <strong>Embed</strong> tab and paste it before the closing <InlineCode>&lt;/body&gt;</InlineCode> tag on every page where the chat bubble should appear.</p>
            <pre className="mt-3 bg-slate-900 text-slate-100 p-3 rounded-lg text-xs overflow-x-auto"><code>{`<script src="https://your-host/widget.js?id=YOUR_BOT_ID"></script>`}</code></pre>
            <p className="mt-3 text-xs text-slate-500">The widget is a single small script with no dependencies. It appears bottom-right and works on mobile. Conversations persist while the visitor's tab is open.</p>
          </DocSection>

          <DocSection id="custom">
            <p>Everything is in the <strong>Appearance</strong> tab:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside marker:text-slate-400">
              <li><strong>Welcome message</strong> — the first thing visitors see.</li>
              <li><strong>Fallback message</strong> — shown when a typed question doesn't match any Q&A pair.</li>
              <li><strong>Theme color</strong> — bubble, header, chips and outgoing messages.</li>
              <li><strong>Logo</strong> — the bot's avatar in the header and beside replies.</li>
              <li><strong>Background image</strong> — a backdrop behind the conversation.</li>
            </ul>
          </DocSection>

          <DocSection id="orders">
            <p>Turn on <strong>Orders</strong> in the Appearance tab to add a “Place an order” option. Visitors enter their name, email, phone and a message; submissions appear in the site's <strong>Orders</strong> tab, where you can export them as CSV.</p>
            <p className="text-xs text-slate-500">Like everything else, the orders option only reaches visitors after you publish.</p>
          </DocSection>

          <DocSection id="trouble">
            <ul className="space-y-3">
              <Trouble q="The widget isn't appearing on my site">
                Make sure you've published at least once and that the snippet is on the page. Open your browser console and look for <InlineCode>[Syncave]</InlineCode> warnings.
              </Trouble>
              <Trouble q="Verification fails">
                Confirm the meta tag is inside <InlineCode>&lt;head&gt;</InlineCode> of the exact URL you added, and that the page is publicly reachable. Re-copy the tag from the Verify tab.
              </Trouble>
              <Trouble q="My edits aren't showing on my site">
                The live widget only serves the <strong>published</strong> version. Publish your draft from the site header.
              </Trouble>
              <Trouble q="A question gets the wrong answer">
                Two questions probably share keywords. Make each question more specific, or check the Q&A list for entries marked <em>Duplicate</em>.
              </Trouble>
            </ul>
          </DocSection>

          <div className="mt-8 rounded-2xl bg-gradient-to-br from-brand-50 to-gold-50/60 border border-brand-100 p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Still stuck?</h3>
              <p className="text-xs text-slate-500 mt-0.5">Check the FAQ or reach out and we'll help.</p>
            </div>
            <Button onClick={onContact}>Help & support <ArrowRight className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      </div>
    </PageBody>
  );
}

function DocSection({ id, children }: { id: string; children: ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id)!;
  return (
    <section id={`doc-${id}`} className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 mb-4 scroll-mt-6 shadow-card">
      <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">{s.icon}</span> {s.title}
      </h2>
      <div className="text-sm text-slate-700 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Trouble({ q, children }: { q: string; children: ReactNode }) {
  return (
    <li>
      <p className="font-medium text-slate-900">{q}</p>
      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{children}</p>
    </li>
  );
}

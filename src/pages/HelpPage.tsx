import { useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, ChevronDown, Mail, Search } from 'lucide-react';
import { Card, PageBody, PageHeader, TextInput } from '@/components/ui';

// TODO: replace with the real support inbox once the domain is set up.
const SUPPORT_EMAIL = 'support@syncave.example';

const FAQ_ITEMS = [
  {
    q: 'How long does it take for changes to show up?',
    a: 'After you click Publish, visitors get the new version on their next page load (the widget script itself may be cached for up to 5 minutes).',
  },
  {
    q: 'Will the widget slow down my site?',
    a: 'No. It is one small script with no dependencies, and the chat only renders once it has loaded.',
  },
  {
    q: 'Do I need an AI or API key?',
    a: 'No. Syncave answers from the Q&A pairs you write, using keyword matching. Nothing is sent to a third-party AI service.',
  },
  {
    q: 'Can I run multiple chatbots on one website?',
    a: 'Only one widget loads per page. Add one site per domain and give each its own Q&A.',
  },
  {
    q: 'Can I delete a Q&A pair without losing the live version?',
    a: 'Yes — deleting a pair only changes your draft. The published version on your site stays the same until you publish again.',
  },
  {
    q: 'What happens if I delete a site?',
    a: 'The bot configuration, Q&A pairs and orders are removed, and the widget on your site stops working immediately.',
  },
];

export function HelpPage({ onOpenDocs }: { onOpenDocs: () => void }) {
  const [open, setOpen] = useState<string | null>(FAQ_ITEMS[0].q);
  const [search, setSearch] = useState('');
  const term = search.toLowerCase();
  const filtered = FAQ_ITEMS.filter((f) => f.q.toLowerCase().includes(term) || f.a.toLowerCase().includes(term));

  return (
    <PageBody width="max-w-3xl">
      <PageHeader title="Help & support" desc="Find answers, learn more, or get in touch." />

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <TextInput placeholder="Search the FAQ…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 py-2.5" />
      </div>

      <Card className="!p-0 overflow-hidden mb-8">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Frequently asked</h2>
        </div>
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">No results for “{search}”.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const isOpen = open === item.q;
              return (
                <li key={item.q}>
                  <button
                    onClick={() => setOpen(isOpen ? null : item.q)}
                    aria-expanded={isOpen}
                    className="w-full px-5 py-3 flex items-center justify-between gap-2 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-slate-900">{item.q}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && <div className="px-5 pb-4 -mt-1 text-sm text-slate-600 leading-relaxed">{item.a}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <ContactCard icon={<Mail className="w-5 h-5 text-brand-600" />} title="Email support" desc="Typical reply within 1 business day." cta={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} />
        <ContactCard icon={<BookOpen className="w-5 h-5 text-brand-600" />} title="Read the docs" desc="Step-by-step guides for setup and customization." cta="Open documentation" onClick={onOpenDocs} />
      </div>
    </PageBody>
  );
}

function ContactCard({ icon, title, desc, cta, href, onClick }: { icon: ReactNode; title: string; desc: string; cta: string; href?: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-50 to-gold-50 border border-brand-100 flex items-center justify-center mb-3">{icon}</div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 mt-1 mb-2">{desc}</p>
      <span className="text-xs font-semibold text-brand-600 inline-flex items-center gap-1">{cta} <ArrowRight className="w-3 h-3" /></span>
    </>
  );
  const cls = 'group block text-left w-full bg-white border border-slate-200/80 rounded-2xl p-5 shadow-card hover:border-brand-200 hover:shadow-card-hover hover:-translate-y-0.5 transition-[box-shadow,border-color,transform] duration-200';
  return href ? <a href={href} className={cls}>{body}</a> : <button onClick={onClick} className={cls}>{body}</button>;
}

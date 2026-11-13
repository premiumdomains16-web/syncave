import { useState, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, LayoutGrid, LifeBuoy, Plus, Search, Sparkles, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { PRICING_URL, usePlan } from '@/components/PlanLock';
import { AccountMenu } from './AccountMenu';
import { hasUnpublishedChanges, type Bot } from '@shared/types';
import type { Route } from '@/hooks/useRoute';
import { hostname } from '@/lib/format';

interface Props {
  bots: Bot[];
  route: Route;
  onNavigate: (r: Route) => void;
  onAddSite: () => void;
  /** Rendered inside the mobile slide-in drawer instead of docked on desktop. */
  drawer?: boolean;
  onClose?: () => void;
}

export function Sidebar({ bots, route, onNavigate: navigate, onAddSite: addSite, drawer, onClose }: Props) {
  // In the drawer, every choice also closes the menu.
  const onNavigate = (r: Route) => { navigate(r); onClose?.(); };
  const onAddSite = () => { addSite(); onClose?.(); };
  const [filter, setFilter] = useState('');
  const { plan, name: planName } = usePlan();
  const q = filter.trim().toLowerCase();
  const shown = q ? bots.filter((b) => b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) : bots;

  return (
    // Desktop: a white rounded panel floating on the grey canvas. Drawer: a full-height white sheet.
    <aside className={`${drawer ? 'flex w-72 max-w-[85vw] h-full' : 'hidden lg:flex w-[17rem] h-screen sticky top-0 p-3 pe-0'} shrink-0 flex-col`}>
      <div className={`flex-1 min-h-0 flex flex-col bg-white text-slate-600 relative overflow-hidden ${drawer ? '' : 'rounded-3xl shadow-card'}`}>
        <div className="relative h-[4.5rem] flex items-center">
          <button onClick={() => onNavigate({ view: 'overview' })} className="flex-1 min-w-0 px-5 h-full flex items-center text-left" aria-label="Syncave home">
            <Logo subtitle="Website chat, in Arabic & English" />
          </button>
          {drawer && (
            <button onClick={onClose} className="me-3 p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors" aria-label="Close menu">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="relative px-3 pt-1 pb-4 flex-1 overflow-y-auto custom-scrollbar" aria-label="Main">
          <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Menu</div>
          <ul className="space-y-1 mb-6">
            <NavItem icon={<LayoutGrid className="w-4 h-4" />} label="Overview" active={route.view === 'overview'} onClick={() => onNavigate({ view: 'overview' })} roomy={drawer} />
            <NavItem icon={<BookOpen className="w-4 h-4" />} label="Docs" active={route.view === 'docs'} onClick={() => onNavigate({ view: 'docs' })} roomy={drawer} />
            <NavItem icon={<LifeBuoy className="w-4 h-4" />} label="Help" active={route.view === 'help'} onClick={() => onNavigate({ view: 'help' })} roomy={drawer} />
          </ul>

          <div className="px-3 mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Sites <span className="ms-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold tabular-nums">{bots.length}</span>
            </span>
            <button
              onClick={onAddSite}
              title="Add site"
              aria-label="Add site"
              className="p-1.5 rounded-lg text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {bots.length > 6 && (
            <div className="relative mb-2 px-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter sites"
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-800 placeholder:text-slate-400 transition-colors focus:bg-white focus:border-brand-400"
              />
            </div>
          )}

          <ul className="space-y-0.5">
            {shown.map((b) => {
              const active = route.view === 'site' && route.botId === b.id;
              const draft = hasUnpublishedChanges(b);
              return (
                <li key={b.id}>
                  <button
                    onClick={() => onNavigate({ view: 'site', botId: b.id })}
                    className={`group w-full flex items-center gap-2.5 px-2 ${drawer ? 'py-2.5' : 'py-1.5'} rounded-xl text-sm text-left transition-colors ${
                      active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                    title={b.url}
                  >
                    <span
                      className="relative w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-semibold shrink-0 overflow-hidden ring-1 ring-black/5"
                      style={{ background: b.themeColor }}
                    >
                      {b.logoUrl ? <img src={b.logoUrl} alt="" className="w-full h-full object-cover" /> : hostname(b.url).charAt(0).toUpperCase()}
                    </span>
                    <span className={`truncate flex-1 ${active ? 'font-medium' : ''}`} dir="auto">{b.name}</span>
                    {draft
                      ? <span className="text-[9px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Draft</span>
                      : <span className={`w-2 h-2 rounded-full shrink-0 ${!b.verified ? 'bg-amber-400' : b.published ? 'bg-green-500' : 'bg-slate-300'}`} title={!b.verified ? 'Unverified' : b.published ? 'Live' : 'Verified, not published'} />}
                  </button>
                </li>
              );
            })}
            {bots.length === 0 && (
              <li className="mx-1 px-3 py-4 rounded-xl border border-dashed border-slate-200 text-center">
                <p className="text-xs text-slate-500">No sites yet</p>
                <button onClick={onAddSite} className="mt-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">Add your first site</button>
              </li>
            )}
            {bots.length > 0 && shown.length === 0 && <li className="px-2.5 py-2 text-xs text-slate-400">No matches</li>}
          </ul>
        </nav>

        {plan !== 'agency' && (
          <div className="relative mx-3 mb-2 rounded-2xl surface-ink text-white p-4 overflow-hidden">
            <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-2.5"><Sparkles className="w-4 h-4 text-brand-300" /></span>
            <div className="text-sm font-semibold">Upgrade your plan</div>
            <p className="text-[11px] text-white/60 mt-0.5 leading-relaxed">You&apos;re on {planName}. Get more sites, questions and orders.</p>
            <a href={PRICING_URL} target="_blank" rel="noopener" className="mt-3 w-full inline-flex items-center justify-center gap-1 rounded-xl bg-gold-500 hover:bg-gold-600 px-3 py-2 text-xs font-semibold text-white transition-colors">
              See plans <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
        <div className="relative px-5 py-2 text-[11px] text-slate-400 flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Live</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />Not live</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Unverified</span>
        </div>
        <AccountMenu />
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active, onClick, roomy }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void; roomy?: boolean }) {
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`relative w-full flex items-center gap-3 px-3 ${roomy ? 'py-3' : 'py-2.5'} rounded-xl text-sm transition-[background-color,color,box-shadow] ${
          active ? 'bg-brand-600 text-white font-medium shadow-brand' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
      >
        <span className={active ? 'text-white' : 'text-slate-400'}>{icon}</span>
        <span>{label}</span>
      </button>
    </li>
  );
}

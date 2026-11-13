import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, Plus } from 'lucide-react';
import type { Bot } from '@shared/types';
import type { Route } from '@/hooks/useRoute';
import { Logo } from '@/components/Logo';
import { Sidebar } from './Sidebar';

/** Phones and tablets: a top bar with a menu button that slides in the same sidebar used on desktop. */
export function MobileNav({ bots, route, onNavigate, onAddSite }: {
  bots: Bot[]; route: Route; onNavigate: (r: Route) => void; onAddSite: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = route.view === 'site' ? bots.find((b) => b.id === route.botId)?.name ?? 'Site'
    : route.view === 'docs' ? 'Docs' : route.view === 'help' ? 'Help' : 'Overview';

  // Close on Escape, lock page scroll while open, and close if the screen grows to desktop size.
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const mq = window.matchMedia('(min-width: 1024px)');
    const wide = () => mq.matches && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', esc);
    mq.addEventListener('change', wide);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', esc); mq.removeEventListener('change', wide); };
  }, [open]);

  return (
    <>
      <header className="lg:hidden fixed top-0 inset-x-0 h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/70 text-slate-900 z-30 px-2 flex items-center justify-between gap-2 overflow-hidden">
        <div className="relative flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo size="sm" />
          <span className="text-slate-300" aria-hidden>/</span>
          <span className="text-sm font-semibold truncate max-w-[40vw]" dir="auto">{current}</span>
        </div>
        <button onClick={onAddSite} className="relative me-1.5 p-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-white shadow-cta active:scale-95 transition-transform" aria-label="Add site">
          <Plus className="w-4 h-4" />
        </button>
      </header>

      {open && createPortal(
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-[fade-up_0.2s_ease-out]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-pop animate-[slide-in-left_0.25s_cubic-bezier(0.22,1,0.36,1)]">
            <Sidebar drawer bots={bots} route={route} onNavigate={onNavigate} onAddSite={onAddSite} onClose={() => setOpen(false)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

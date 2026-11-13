import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ExternalLink, LogOut } from 'lucide-react';
import { useAuth } from '@/auth';

const PLAN_LABEL = { free: 'Free plan', starter: 'Starter plan', business: 'Business plan', agency: 'Agency plan' } as const;

export async function logoutAndLeave(logout: () => Promise<void>) {
  await logout();
  window.location.assign('/');
}

/** Signed-in user + log out, pinned to the bottom of the sidebar. */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!user) return null;
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative border-t border-slate-100 p-2">
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 rounded-2xl border border-slate-200/80 bg-white shadow-pop py-1 text-sm animate-fade-up" role="menu">
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
            <div className="text-[11px] font-semibold text-brand-600 mt-0.5">{PLAN_LABEL[user.plan]}</div>
          </div>
          <a href="/" target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50" role="menuitem">
            <ExternalLink className="w-4 h-4 text-slate-400" /> Syncave website
          </a>
          <button onClick={() => logoutAndLeave(logout)} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 text-left" role="menuitem">
            <LogOut className="w-4 h-4 text-slate-400" /> Log out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50 transition-colors text-left"
      >
        <span className="w-8 h-8 rounded-full ai-gradient text-white text-sm font-semibold flex items-center justify-center shrink-0 ring-2 ring-white shadow-brand">{initial}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900 truncate" dir="auto">{user.name}</span>
          <span className="block text-[11px] text-slate-500 truncate">{PLAN_LABEL[user.plan]}</span>
        </span>
        <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
    </div>
  );
}

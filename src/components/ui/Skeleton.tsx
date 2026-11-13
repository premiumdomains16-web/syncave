// Loading placeholders that mirror real layouts, so first paint doesn't jump from
// a spinner to a full page.
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('rounded-lg bg-slate-200/70 animate-pulse', className)} />;
}

/** Whole dashboard frame (sidebar + content) while we don't yet know who is logged in. */
export function AppShellSkeleton() {
  return (
    <div className="h-screen flex overflow-hidden bg-slate-100" role="status" aria-label="Loading">
      <aside className="hidden lg:flex w-[17rem] shrink-0 p-3 pe-0"><div className="flex-1 flex flex-col bg-white rounded-3xl shadow-card">
        <div className="px-5 h-[4.5rem] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[9px] bg-slate-100 animate-pulse" />
          <div className="space-y-1.5"><div className="h-3.5 w-20 rounded bg-slate-100 animate-pulse" /><div className="h-2.5 w-32 rounded bg-slate-100 animate-pulse" /></div>
        </div>
        <div className="px-3 py-4 space-y-1.5">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />)}
          <div className="h-3 w-16 rounded bg-slate-100 animate-pulse mt-6 ms-2" />
          {[0, 1].map((i) => <div key={i} className="h-9 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      </div></aside>
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-slate-200/70" />
      <main className="flex-1 min-w-0 pt-14 lg:pt-0"><OverviewSkeleton /></main>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="flex-1 overflow-hidden" role="status" aria-label="Loading">
      <div className="px-4 sm:px-6 lg:px-10 py-8 mx-auto w-full max-w-5xl">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-72 mt-3" />
          </div>
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
        <Skeleton className="h-40 w-full rounded-3xl mb-6 bg-brand-900/10" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-slate-200/80 rounded-2xl p-4">
              <div className="flex items-center justify-between"><Skeleton className="h-3 w-14" /><Skeleton className="h-8 w-8 rounded-xl" /></div>
              <Skeleton className="h-8 w-12 mt-3" />
              <Skeleton className="h-3 w-20 mt-2" />
            </div>
          ))}
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 mb-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-56 mt-2" />
          <div className="mt-5 grid sm:grid-cols-3 gap-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        </div>
        <RowsSkeleton rows={3} />
      </div>
    </div>
  );
}

/** A card of list rows (orders, unanswered questions, sites). */
export function RowsSkeleton({ rows = 4, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden" role="status" aria-label="Loading">
      {header && <div className="px-5 py-3 border-b border-slate-100"><Skeleton className="h-4 w-24" /></div>}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="px-5 py-3 flex items-center gap-4 border-b border-slate-100 last:border-0">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1"><Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-3 w-28 mt-2" /></div>
          <Skeleton className="h-5 w-20 rounded-full hidden md:block" />
        </div>
      ))}
    </div>
  );
}

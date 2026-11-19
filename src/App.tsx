import { useEffect, useState } from 'react';
import { Plus, SearchX, ServerCrash } from 'lucide-react';
import { useBots } from '@/hooks/useBots';
import { useRoute, type Route } from '@/hooks/useRoute';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Button, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { OverviewSkeleton } from '@/components/ui/Skeleton';
import { CreateSiteModal } from '@/features/CreateSiteModal';
import { SiteView } from '@/features/site/SiteView';
import { OverviewPage } from '@/pages/OverviewPage';
import { DocsPage } from '@/pages/DocsPage';
import { HelpPage } from '@/pages/HelpPage';
import { BillingPage } from '@/pages/BillingPage';
import { AdminPage } from '@/pages/AdminPage';
import { useAuth } from '@/auth';
import { api } from '@/lib/api';
import { PENDING_SITE_KEY } from '@/simulator/SimulatorPage';

export default function App() {
  const botsApi = useBots();
  const { bots, loaded, loadError } = botsApi;
  const { route, navigate } = useRoute();
  const notify = useToast();
  const [creating, setCreating] = useState(false);
  // A site the visitor previewed in the simulator before signing up: suggest it on the
  // overview (never auto-open a dialog — people land in the dashboard and want to look around).
  const [pendingSite, setPendingSite] = useState<string | undefined>(() => {
    try { return sessionStorage.getItem(PENDING_SITE_KEY) || undefined; } catch { return undefined; }
  });
  const [createUrl, setCreateUrl] = useState<string | undefined>(undefined);
  const dismissPending = () => {
    setPendingSite(undefined);
    try { sessionStorage.removeItem(PENDING_SITE_KEY); } catch {}
  };
  const openCreate = (url?: string) => { setCreateUrl(url); setCreating(true); };

  const activeBot = route.view === 'site' ? bots.find((b) => b.id === route.botId) : undefined;
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  // Payments waiting for review (admin only): shown as a badge in the sidebar.
  const [pendingPayments, setPendingPayments] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    api.adminPayments('pending').then((r) => setPendingPayments(r.payments.length)).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    const base = 'Syncave';
    const page = activeBot?.name ?? (route.view === 'site' ? null : route.view[0].toUpperCase() + route.view.slice(1));
    document.title = page ? `${page} · ${base}` : base;
  }, [route, activeBot?.name]);

  const handleCreate = async (url: string, templateId: string) => {
    const bot = await botsApi.create(url, templateId);
    setCreating(false);
    if (pendingSite) dismissPending();
    navigate({ view: 'site', botId: bot.id });
    notify('ok', `Added ${bot.name}. Next: verify your domain.`);
  };

  const go = (r: Route) => navigate(r);

  return (
    <div className="h-screen bg-slate-100 text-slate-900 font-sans antialiased flex overflow-hidden">
      <Sidebar bots={bots} route={route} onNavigate={go} onAddSite={() => openCreate()} isAdmin={isAdmin} pendingPayments={pendingPayments} />
      <MobileNav bots={bots} route={route} onNavigate={go} onAddSite={() => openCreate()} isAdmin={isAdmin} pendingPayments={pendingPayments} />

      <main className="flex-1 min-w-0 flex flex-col pt-14 lg:pt-0 bg-slate-100 relative isolate">
        {!loaded ? (
          <OverviewSkeleton />
        ) : loadError ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState icon={<ServerCrash className="w-6 h-6" />} title="Couldn't load your sites" desc={loadError} action={<Button onClick={botsApi.reload}>Try again</Button>} />
          </div>
        ) : route.view === 'overview' ? (
          <OverviewPage bots={bots} onNavigate={go} onAddSite={() => openCreate()} suggestedUrl={pendingSite} onAddSuggested={() => openCreate(pendingSite)} onDismissSuggested={dismissPending} />
        ) : route.view === 'docs' ? (
          <DocsPage onContact={() => go({ view: 'help' })} />
        ) : route.view === 'help' ? (
          <HelpPage onOpenDocs={() => go({ view: 'docs' })} />
        ) : route.view === 'billing' ? (
          <BillingPage initialPlan={route.plan} />
        ) : route.view === 'admin' ? (
          isAdmin
            ? <AdminPage onPendingCount={setPendingPayments} pendingCount={pendingPayments} />
            : <div className="flex-1 flex items-center justify-center"><EmptyState icon={<SearchX className="w-6 h-6" />} title="Page not found" /></div>
        ) : activeBot ? (
          <SiteView
            key={activeBot.id}
            bot={activeBot}
            botsApi={botsApi}
            tab={route.tab}
            onTabChange={(tab) => navigate({ view: 'site', botId: activeBot.id, tab }, { replace: true })}
            onBack={() => go({ view: 'overview' })}
            onDeleted={() => navigate({ view: 'overview' }, { replace: true })}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<SearchX className="w-6 h-6" />}
              title="Site not found"
              desc="It may have been deleted. Pick another site from the sidebar or add a new one."
              action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => openCreate()}>Add website</Button>}
            />
          </div>
        )}
      </main>

      <CreateSiteModal
        open={creating}
        dismissible
        initialUrl={createUrl}
        siteCount={bots.length}
        onClose={() => setCreating(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

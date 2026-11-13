import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShellSkeleton } from './components/ui/Skeleton';
import App from './App';
import { useAuth } from './auth';
import { applyDocumentLanguage, useLang } from './i18n';
import { usePath } from './hooks/usePath';
import { LandingPage } from './landing/LandingPage';
import { AuthPage } from './landing/AuthPage';
import { SimulatorPage } from './simulator/SimulatorPage';

const TITLES = {
  en: { landing: 'Syncave — Arabic-first chatbots for business websites', login: 'Log in · Syncave', signup: 'Create your account · Syncave', simulate: 'Try Syncave on your website' },
  ar: { landing: 'Syncave — شات بوت عربي لمواقع الشركات', login: 'تسجيل الدخول · Syncave', signup: 'إنشاء حساب · Syncave', simulate: 'جرّب Syncave على موقعك' },
};

/** Top-level pages: / (landing), /login, /signup, /simulate, and /app (the dashboard, login required). */
export function Root() {
  const path = usePath();
  const { lang } = useLang();
  const { status } = useAuth();
  const isApp = path === '/app' || path.startsWith('/app/');
  const page = path === '/login' ? 'login' : path === '/signup' ? 'signup' : path === '/simulate' ? 'simulate' : 'landing';

  // The dashboard was previously served at /#/…; forward old links and bookmarks.
  useEffect(() => {
    if (path === '/' && window.location.hash.startsWith('#/')) window.location.replace(`/app${window.location.hash}`);
  }, [path]);

  useEffect(() => {
    applyDocumentLanguage(isApp ? 'en' : lang);
    if (!isApp) document.title = TITLES[lang][page];
  }, [isApp, lang, page]);

  useEffect(() => {
    if (isApp && status === 'signedOut') {
      const next = window.location.pathname + window.location.hash;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [isApp, status]);

  if (isApp) {
    if (status !== 'signedIn') return <AppShellSkeleton />;
    return <App />;
  }
  if (page === 'login' || page === 'signup') return <AuthPage key={page} mode={page} />;
  if (page === 'simulate') return <SimulatorPage />;
  return <LandingPage />;
}

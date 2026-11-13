import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root.tsx';
import { AuthProvider } from './auth.tsx';
import { LangProvider } from './i18n.tsx';
import { ToastProvider } from './components/ui/Toast.tsx';
import { initNativeApp } from './lib/native.ts';
import { initAnalytics } from './lib/firebase.ts';
import './index.css';

initNativeApp();
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <AuthProvider>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </AuthProvider>
    </LangProvider>
  </StrictMode>,
);

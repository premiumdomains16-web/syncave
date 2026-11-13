// Firebase (web): app + Analytics.
//
// Paste your config into FIREBASE_CONFIG below. Alternatively (e.g. a different project
// for testing and production), leave it empty and set these in .env.local:
//
//   VITE_FIREBASE_API_KEY=...
//   VITE_FIREBASE_AUTH_DOMAIN=...
//   VITE_FIREBASE_PROJECT_ID=...
//   VITE_FIREBASE_STORAGE_BUCKET=...
//   VITE_FIREBASE_MESSAGING_SENDER_ID=...
//   VITE_FIREBASE_APP_ID=...
//   VITE_FIREBASE_MEASUREMENT_ID=G-...
//
// These web keys are not secret (they ship to every browser); access is controlled by
// Firebase security rules. Restart `npm run dev` after changing them.
// If they're missing, Firebase is simply skipped and the app works as before.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported, logEvent, type Analytics } from 'firebase/analytics';

// ============================================================================
// Your web app's Firebase configuration: paste your values between the quotes.
// (Firebase console → Project settings → Your apps → SDK setup and configuration)
// ============================================================================
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};
// ============================================================================

const env = import.meta.env;

// Values typed above win; anything left empty falls back to the VITE_FIREBASE_* lines in .env.local.
const firebaseConfig = {
  apiKey: FIREBASE_CONFIG.apiKey || env.VITE_FIREBASE_API_KEY,
  authDomain: FIREBASE_CONFIG.authDomain || env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_CONFIG.projectId || env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_CONFIG.storageBucket || env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_CONFIG.messagingSenderId || env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_CONFIG.appId || env.VITE_FIREBASE_APP_ID,
  measurementId: FIREBASE_CONFIG.measurementId || env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.projectId);

export const app: FirebaseApp | null = firebaseEnabled ? initializeApp(firebaseConfig) : null;

let analytics: Analytics | null = null;

/** Starts Analytics when it's configured and the browser supports it (not in some WebViews/private modes). */
export async function initAnalytics(): Promise<void> {
  if (!app || !firebaseConfig.measurementId || analytics) return;
  try {
    if (await isSupported()) analytics = getAnalytics(app);
  } catch (e) {
    console.warn('Firebase Analytics not started:', (e as Error).message);
  }
}

/** Records a custom event, e.g. track('sign_up', { method: 'email' }). Does nothing if Analytics isn't running. */
export function track(event: string, params?: Record<string, unknown>) {
  if (analytics) logEvent(analytics, event, params);
}

/** Records a page view for in-app navigation (the first load is counted automatically). */
export function trackPage(path = location.pathname + location.hash) {
  track('page_view', { page_path: path, page_location: location.href, page_title: document.title });
}

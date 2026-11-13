// Capacitor wraps Syncave in native Android/iOS apps.
//
// The app loads the live Syncave server (dashboard at /app) instead of a bundled
// copy: every screen needs the server anyway, and loading it from its own origin
// keeps login cookies and API calls working exactly like the website.
//
// Set the address when syncing, e.g.:
//   CAP_SERVER_URL=https://app.syncave.com   (production — must be HTTPS)
//   CAP_SERVER_URL=http://172.20.10.5:3000   (this PC, for testing on a phone on the same network)
//   CAP_SERVER_URL=http://10.0.2.2:3000      (this PC, from the Android emulator)
// then run `npx cap sync android`. The value is baked into the app at sync time.
import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = (process.env.CAP_SERVER_URL || 'http://10.0.2.2:3000').replace(/\/+$/, '');
const isHttp = serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'com.syncave.app',
  appName: 'Syncave',
  // Bundled into the app only as the offline fallback page (public/offline.html).
  webDir: 'dist',
  server: {
    url: `${serverUrl}/app`,
    // Plain http is only acceptable for local testing; production must use https.
    cleartext: isHttp,
    errorPath: 'offline.html',
  },
  android: {
    // Lets the app's WebView be inspected from desktop Chrome (chrome://inspect) in debug builds only.
    webContentsDebuggingEnabled: isHttp,
  },
  plugins: {
    SystemBars: {
      // Pad the WebView around Android's status/navigation bars so content never hides under them.
      insetsHandling: 'native',
      // Dark icons on our light headers.
      style: 'LIGHT',
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
  },
};

export default config;

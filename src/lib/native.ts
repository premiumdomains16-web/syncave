// Behaviour that differs when Syncave runs inside the Capacitor app
// (see capacitor.config.ts). On the website these are no-ops.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isNativeApp = Capacitor.isNativePlatform();

/**
 * Opens one of our own pages. On the web it opens a new tab; the app has no
 * tabs (and a system-browser tab wouldn't be logged in), so it navigates in place.
 */
export function openPage(url: string) {
  if (isNativeApp) window.location.assign(url);
  else window.open(url, '_blank', 'noopener');
}

export function initNativeApp() {
  if (!isNativeApp) return;
  document.documentElement.classList.add('native-app');
  // Android back button: go back a page; on the first page, leave the app.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
}

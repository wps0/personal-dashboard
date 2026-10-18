import {create} from 'zustand';

/** Chrome/Edge's install prompt event (not in the DOM typings yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
}

let deferred: BeforeInstallPromptEvent | null = null;

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches;
}

/** Whether the browser offers to install the app, and whether it already runs installed. */
export const useInstall = create<{canInstall: boolean; installed: boolean}>(
  () => ({canInstall: false, installed: standalone()}),
);

/**
 * Registers the service worker (production builds only: in development it
 * would serve stale modules) and listens for the browser's install offer.
 */
export function setUpPwa() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator)
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Offline support is a bonus; the app works without it.
      });
    });
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // offered from Settings instead of a browser banner
    deferred = e as BeforeInstallPromptEvent;
    useInstall.setState({canInstall: true});
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    useInstall.setState({canInstall: false, installed: true});
  });
}

/** Shows the browser's install dialog. */
export async function install() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  useInstall.setState({canInstall: false});
}

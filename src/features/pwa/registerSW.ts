/**
 * Service-worker registration (vite-plugin-pwa, `registerType: 'prompt'`). Kept in its own module so components and
 * tests do not depend on the virtual module: the dev server and the build resolve `virtual:pwa-register` (a no-op in
 * dev, where the worker is disabled); unit tests mock this file.
 */

/** Callbacks of the registration. */
export interface ServiceWorkerHandlers {
  /** A new version is installed and waiting – show "Neue Version verfügbar". */
  onNeedRefresh: () => void;
  /** The app shell is cached – the app now works offline. */
  onOfflineReady?: () => void;
}

/** Activates the waiting worker; the page reloads once it controls the page. */
export type ApplyUpdate = () => Promise<void>;

/** Registers the service worker (only in production builds and only where supported). */
export async function registerServiceWorker(handlers: ServiceWorkerHandlers): Promise<ApplyUpdate | null> {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const { registerSW } = await import('virtual:pwa-register');
  const update = registerSW({
    immediate: true,
    onNeedRefresh: handlers.onNeedRefresh,
    onOfflineReady: handlers.onOfflineReady,
    onRegisterError: (err: unknown) => console.warn('Service worker registration failed', err),
  });
  return () => update(true);
}

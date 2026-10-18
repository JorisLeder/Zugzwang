/**
 * PWA state shared by the shell banners: online status (`navigator.onLine` + `online`/`offline` events) and the
 * service-worker update ("Neue Version verfügbar"). The worker is registered once per page load, however often the
 * banner mounts (React StrictMode, route changes).
 */
import { useSyncExternalStore } from 'react';
import { registerServiceWorker, type ApplyUpdate } from './registerSW';

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** Whether the browser reports a network connection (true during server rendering and in old browsers). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' ? true : navigator.onLine),
    () => true,
  );
}

/** State of the service-worker update. */
export interface UpdateState {
  /** A new version waits for activation. */
  needRefresh: boolean;
  /** The learner chose "Später" for this version. */
  dismissed: boolean;
  /** The update is being applied (page reloads soon). */
  applying: boolean;
}

let state: UpdateState = { needRefresh: false, dismissed: false, applying: false };
let apply: ApplyUpdate | null = null;
let started = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

/** Registers the service worker once (later calls are no-ops). */
export function startServiceWorker(): void {
  if (started) return;
  started = true;
  registerServiceWorker({ onNeedRefresh: () => setState({ needRefresh: true, dismissed: false }) }).then(
    (fn) => {
      apply = fn;
    },
    (err: unknown) => console.warn('Service worker could not be registered', err),
  );
}

/** Activates the waiting version (the page reloads when the new worker takes control). */
export async function applyUpdate(): Promise<void> {
  if (!apply) return;
  setState({ applying: true });
  try {
    await apply();
  } catch (err) {
    console.warn('Update could not be applied', err);
    setState({ applying: false });
  }
}

/** Hides the update prompt until the next new version. */
export function dismissUpdate(): void {
  setState({ dismissed: true });
}

/** The live update state. */
export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

/** Test hook: simulates a waiting version and resets the module state. */
export const __testing = {
  reset(): void {
    state = { needRefresh: false, dismissed: false, applying: false };
    apply = null;
    started = false;
    for (const l of listeners) l();
  },
  needRefresh(fn: ApplyUpdate | null = null): void {
    apply = fn;
    setState({ needRefresh: true, dismissed: false });
  },
};

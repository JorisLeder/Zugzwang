import { useMemo } from 'react';
import { useServices } from '@/app/services';
import type { SyncState } from '@/core/storage';
import { useSubscribable } from '@/lib/observable';

/** Current sync state (re-renders on every change). */
export function useSyncState(): SyncState {
  const { data } = useServices();
  const source = useMemo(() => data.sync.observe(), [data]);
  return useSubscribable(source, data.sync.state());
}

const LOCAL_BANNER_KEY = 'zz-local-banner-dismissed';

/** Whether the local-mode banner was dismissed in this browser session. */
export function localBannerDismissed(): boolean {
  try {
    return sessionStorage.getItem(LOCAL_BANNER_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remembers the dismissal for the rest of the session (shown again in the next session). */
export function dismissLocalBanner(): void {
  try {
    sessionStorage.setItem(LOCAL_BANNER_KEY, '1');
  } catch {
    // Storage unavailable: the banner stays dismissed until reload.
  }
}

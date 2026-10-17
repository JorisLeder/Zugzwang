/**
 * Status banners above the page content (rendered by `AuthGate`):
 * - local mode: "Lokaler Modus – Fortschritt nur auf diesem Gerät" once per browser session (until dismissed);
 * - cloud mode: "Nicht synchronisiert" while saving keeps failing (after 3 s, so short hiccups stay silent).
 * The offline banner is the PWA package's. Hidden on board screens, whose layout fills the viewport.
 */
import { useEffect, useState } from 'react';
import { useServices } from '@/app/services';
import { Banner, Button, Dialog } from '@/ui/primitives';
import { SYNC_DE } from './strings.de';
import { SyncHelpDialogContent } from './SyncHelpDialog';
import { dismissLocalBanner, localBannerDismissed, useSyncState } from './useSyncState';

/** Delay before a persisting sync error is shown as a banner. */
export const ERROR_BANNER_DELAY_MS = 3000;

/** Banners of the sync status. */
export function SyncBanners() {
  const { data } = useServices();
  const state = useSyncState();
  const [dismissed, setDismissed] = useState(localBannerDismissed);
  const [helpOpen, setHelpOpen] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);

  const failing = state.status === 'error';
  useEffect(() => {
    if (!failing) return undefined;
    const t = setTimeout(() => setErrorVisible(true), ERROR_BANNER_DELAY_MS);
    return () => {
      clearTimeout(t);
      setErrorVisible(false); // the next failure waits again
    };
  }, [failing]);

  const showLocal = state.mode === 'local' && !dismissed;
  const showError = state.mode === 'cloud' && failing && errorVisible;
  if (!showLocal && !showError && !helpOpen) return null;

  const learnMore = (
    <Button variant="link" size="sm" onClick={() => setHelpOpen(true)}>
      {SYNC_DE.learnMore}
    </Button>
  );

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <div className="[[data-board-screen]_&]:hidden" data-testid="sync-banners">
        {showLocal && (
          <Banner
            tone="info"
            action={learnMore}
            onDismiss={() => {
              dismissLocalBanner();
              setDismissed(true);
            }}
          >
            {SYNC_DE.localBanner}
          </Banner>
        )}
        {showError && (
          <Banner
            tone="warning"
            action={
              <Button variant="link" size="sm" onClick={() => void data.sync.flush()}>
                {SYNC_DE.retryNow}
              </Button>
            }
          >
            {SYNC_DE.errorBanner}
          </Banner>
        )}
      </div>
      {helpOpen && <SyncHelpDialogContent />}
    </Dialog>
  );
}

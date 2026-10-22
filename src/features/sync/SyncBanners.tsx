/**
 * Status banners above the page content (rendered by `AuthGate`):
 * - local mode: "Lokaler Modus – Fortschritt nur auf diesem Gerät" once per browser session (until dismissed);
 * - cloud mode: "Nicht synchronisiert" while saving keeps failing (after 3 s, so short hiccups stay silent).
 * The offline banner is the PWA package's. Hidden on board screens, whose layout fills the viewport.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useServices } from '@/app/services';
import { Banner } from '@/ui/primitives/Banner';
import { Button } from '@/ui/primitives/Button';
import { onlyDeadLetters, SYNC_DE } from './strings.de';
import { dismissLocalBanner, localBannerDismissed, useSyncState } from './useSyncState';

/** The help dialog loads on demand (keeps the dialog primitives off the start-up path). */
const SyncHelpDialog = lazy(() => import('./SyncHelpDialog').then((m) => ({ default: m.SyncHelpDialog })));

/** Delay before a persisting sync error is shown as a banner. */
export const ERROR_BANNER_DELAY_MS = 3000;

/** Banners of the sync status. */
export function SyncBanners() {
  const { data } = useServices();
  const state = useSyncState();
  const [dismissed, setDismissed] = useState(localBannerDismissed);
  const [helpOpen, setHelpOpen] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const failing = state.status === 'error';
  useEffect(() => {
    if (!failing) return undefined;
    const t = setTimeout(() => setErrorVisible(true), ERROR_BANNER_DELAY_MS);
    return () => {
      clearTimeout(t);
      setErrorVisible(false); // the next failure waits again
      setConfirmDiscard(false);
    };
  }, [failing]);

  const showLocal = state.mode === 'local' && !dismissed;
  const showError = state.mode === 'cloud' && failing && errorVisible;
  const canDiscard = typeof data.sync.dismissDeadLetters === 'function';
  const discard = () => {
    setConfirmDiscard(false);
    void data.sync.dismissDeadLetters?.();
  };
  if (!showLocal && !showError && !helpOpen) return null;

  const learnMore = (
    <Button variant="link" size="sm" onClick={() => setHelpOpen(true)}>
      {SYNC_DE.learnMore}
    </Button>
  );

  return (
    <>
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
        {showError && onlyDeadLetters(state) && (
          <Banner
            tone="warning"
            action={
              canDiscard &&
              (confirmDiscard ? (
                <span className="flex shrink-0 gap-1">
                  <Button variant="link" size="sm" onClick={discard}>
                    {SYNC_DE.discardConfirmAction}
                  </Button>
                  <Button variant="link" size="sm" onClick={() => setConfirmDiscard(false)}>
                    {SYNC_DE.discardCancel}
                  </Button>
                </span>
              ) : (
                <Button variant="link" size="sm" onClick={() => setConfirmDiscard(true)}>
                  {SYNC_DE.discard}
                </Button>
              ))
            }
          >
            {confirmDiscard ? SYNC_DE.discardConfirm : SYNC_DE.deadLetterBanner}
          </Banner>
        )}
        {showError && !onlyDeadLetters(state) && (
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
      {helpOpen && (
        <Suspense fallback={null}>
          <SyncHelpDialog onOpenChange={setHelpOpen} />
        </Suspense>
      )}
    </>
  );
}

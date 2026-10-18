/**
 * Shell slot above the main content (PRD Gestaltungsregeln, NFR Offline): the offline banner ("Du bist offline –
 * Puzzles laufen weiter.") and the update prompt of the service worker ("Neue Version verfügbar"). Mounting the slot
 * registers the service worker (production builds only).
 *
 * Board screens fill the viewport, so there the offline hint is a small pill floating over the top edge instead of a
 * full-width banner, and the update prompt waits until the learner leaves the board.
 */
import { RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { Banner, Button, OfflineIcon } from '@/ui/primitives';
import { applyUpdate, dismissUpdate, startServiceWorker, useOnline, useUpdateState } from './pwaState';
import { STRINGS_DE } from './strings.de';

/** Offline banner and update prompt. */
export function OfflineBanner() {
  const online = useOnline();
  const update = useUpdateState();

  useEffect(() => {
    startServiceWorker();
  }, []);

  const showUpdate = update.needRefresh && !update.dismissed;
  if (online && !showUpdate) return null;

  return (
    <>
      {!online && (
        <>
          <div className="[[data-board-screen]_&]:hidden" data-testid="offline-banner">
            <Banner tone="warning" icon={<OfflineIcon />}>
              {STRINGS_DE.offline}
            </Banner>
          </div>
          <div
            role="status"
            data-testid="offline-pill"
            className="pointer-events-none fixed left-1/2 top-2 z-40 hidden max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-full bg-warning-subtle px-3 py-1.5 text-caption text-text shadow-2 [[data-board-screen]_&]:flex"
          >
            <OfflineIcon aria-hidden="true" className="size-4 shrink-0 text-warning-text" />
            <span className="min-w-0 truncate">{STRINGS_DE.offline}</span>
          </div>
        </>
      )}
      {showUpdate && (
        <div className="[[data-board-screen]_&]:hidden" data-testid="update-banner">
          <Banner
            tone="info"
            icon={<RefreshCw />}
            onDismiss={update.applying ? undefined : dismissUpdate}
            action={
              <Button size="sm" onClick={() => void applyUpdate()} loading={update.applying} disabled={update.applying}>
                {update.applying ? STRINGS_DE.updating : STRINGS_DE.updateReload}
              </Button>
            }
          >
            {STRINGS_DE.updateAvailable}
          </Banner>
        </div>
      )}
    </>
  );
}

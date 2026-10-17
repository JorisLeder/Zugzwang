/** In-app help "Speichern und Synchronisieren": local vs cloud mode, what syncs, conflict rules, setup. */
import { DialogContent } from '@/ui/primitives';
import { SYNC_DE, SYNC_STATUS_DE } from './strings.de';
import { useSyncState } from './useSyncState';

/** Content of the help dialog (render inside a `Dialog`). */
export function SyncHelpDialogContent() {
  const state = useSyncState();
  const status = SYNC_STATUS_DE[state.status];
  const time = state.lastSyncedAt
    ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(state.lastSyncedAt))
    : null;
  return (
    <DialogContent title={SYNC_DE.helpTitle} description={SYNC_DE.helpCurrentMode[state.mode]}>
      <div className="flex flex-col gap-1 rounded-md bg-surface-2 p-3 text-body-sm" data-testid="sync-help-status">
        <p className="font-semibold text-text">{status.label}</p>
        <p className="text-muted">{status.description}</p>
        {state.mode === 'cloud' && state.pending > 0 && <p className="text-muted">{SYNC_DE.pendingCount(state.pending)}</p>}
        {state.mode === 'cloud' && time && <p className="text-muted">{SYNC_DE.lastSynced(time)}</p>}
      </div>
      <div className="flex flex-col gap-4">
        {SYNC_DE.help.map((section) => (
          <section key={section.title} className="flex flex-col gap-1">
            <h3 className="text-h3 text-text">{section.title}</h3>
            {section.paragraphs.map((p) => (
              <p key={p} className="text-body-sm text-muted">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </DialogContent>
  );
}

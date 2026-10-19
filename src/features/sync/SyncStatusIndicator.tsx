/**
 * Shell slot (D-03): sync status in the sidebar footer. Shows Gespeichert · Speichern … · Offline ·
 * Nicht synchronisiert (retrying automatically) · Lokal; a click opens the help "Speichern und Synchronisieren".
 * Word + icon, never colour alone. Icon only on the 72 px rail (< 1280 px) or with `compact`.
 */
import { CloudAlert, CloudCheck, CloudOff, HardDrive, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { SyncState } from '@/core/storage';
import { cn } from '@/lib/cn';
import { Dialog } from '@/ui/primitives/Dialog';
import { Tooltip } from '@/ui/primitives/Tooltip';
import { SYNC_DE, syncStatusText } from './strings.de';
import { SyncHelpDialogContent } from './SyncHelpDialog';
import { useSyncState } from './useSyncState';

/** Props of `SyncStatusIndicator`. */
export interface SyncStatusIndicatorProps {
  /** Icon-only presentation (icon rail 768–1279 px). */
  compact?: boolean;
}

const ICONS: Record<SyncState['status'], typeof CloudCheck> = {
  'local-only': HardDrive,
  synced: CloudCheck,
  pending: RefreshCw,
  offline: CloudOff,
  error: CloudAlert,
};

const TONES: Record<SyncState['status'], string> = {
  'local-only': 'text-info-text',
  synced: 'text-muted',
  pending: 'text-muted',
  offline: 'text-warning-text',
  error: 'text-warning-text',
};

/** Sync status indicator. */
export function SyncStatusIndicator({ compact = false }: SyncStatusIndicatorProps) {
  const state = useSyncState();
  const [open, setOpen] = useState(false);
  const status = syncStatusText(state);
  const Icon = ICONS[state.status];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip content={status.description} side="right">
        <button
          type="button"
          data-testid="sync-status"
          data-status={state.status}
          aria-label={SYNC_DE.statusButton(status.label)}
          onClick={() => setOpen(true)}
          className={cn(
            'focus-inset flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-caption hover:bg-surface-2',
            !compact && 'xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-body-sm',
            TONES[state.status],
          )}
        >
          <Icon aria-hidden="true" className={cn('size-5 shrink-0', state.status === 'pending' && 'motion-safe:animate-spin')} />
          <span aria-hidden="true" className={cn(compact ? 'sr-only' : 'sr-only xl:not-sr-only', 'truncate')}>
            {status.label}
          </span>
        </button>
      </Tooltip>
      <span role="status" className="sr-only">
        {status.label}
      </span>
      {open && <SyncHelpDialogContent />}
    </Dialog>
  );
}

import { CircleAlert, CloudOff, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { PRIMITIVES_DE } from './strings.de';

/** Props of `Banner`. */
export interface BannerProps {
  /** `info` (local mode), `warning` (offline, not synced), `danger` (errors). */
  tone: 'info' | 'warning' | 'danger';
  /** One sentence (DESIGN §9.3). */
  children: ReactNode;
  /** Custom leading icon. */
  icon?: ReactNode;
  /** Optional action (e.g. "Mehr erfahren"). */
  action?: ReactNode;
  /** Shows a close button. */
  onDismiss?: () => void;
  className?: string;
}

const ICONS = { info: Info, warning: TriangleAlert, danger: CircleAlert } as const;

/** Full-width status banner (sync, offline, local mode; DESIGN §5.9). `role="status"`. */
export function Banner({ tone, children, icon, action, onDismiss, className }: BannerProps) {
  const Icon = ICONS[tone];
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-10 items-center gap-3 px-4 py-2 text-body-sm text-text',
        tone === 'info' && 'bg-info-subtle',
        tone === 'warning' && 'bg-warning-subtle',
        tone === 'danger' && 'bg-danger-subtle',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('inline-flex shrink-0 [&_svg]:size-5', tone === 'info' && 'text-info-text', tone === 'warning' && 'text-warning-text', tone === 'danger' && 'text-danger-text')}
      >
        {icon ?? <Icon />}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
      {onDismiss && (
        <button
          type="button"
          aria-label={PRIMITIVES_DE.close}
          onClick={onDismiss}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text pointer-coarse:size-11"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Icon for the offline banner (re-exported for the PWA package). */
export const OfflineIcon = CloudOff;

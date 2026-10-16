import { Flame } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PRIMITIVES_DE } from './strings.de';

/** Props of `StreakBadge`. */
export interface StreakBadgeProps {
  /** Current streak in days (D-14). */
  days: number;
  /** At least one action completed today. */
  trainedToday: boolean;
  className?: string;
}

/** Streak pill (DESIGN §5.7). Never shames: after a break it simply shows "Tag 1" again. */
export function StreakBadge({ days, trainedToday, className }: StreakBadgeProps) {
  if (days <= 0) {
    return (
      <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong px-3 text-caption text-muted', className)}>
        <Flame aria-hidden="true" className="size-4" />
        {PRIMITIVES_DE.streakStart}
      </span>
    );
  }
  return (
    <span
      aria-label={`${PRIMITIVES_DE.streakLabel(days)}${trainedToday ? '' : ` – ${PRIMITIVES_DE.streakOpenToday}`}`}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3',
        trainedToday ? 'bg-warning-subtle' : 'border border-border-strong',
        className,
      )}
    >
      <Flame aria-hidden="true" className={cn('size-4', trainedToday ? 'text-warning-text' : 'text-muted')} />
      <span aria-hidden="true" className="font-semibold tabular-nums text-text">
        {days}
      </span>
      <span aria-hidden="true" className="text-caption text-muted">
        {trainedToday ? PRIMITIVES_DE.streakDays(days) : `${PRIMITIVES_DE.streakDays(days)} · ${PRIMITIVES_DE.streakOpenToday}`}
      </span>
    </span>
  );
}

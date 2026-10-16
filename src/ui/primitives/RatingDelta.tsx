import { formatDelta } from '@/i18n/format';
import { cn } from '@/lib/cn';

/** Props of `RatingDelta`. */
export interface RatingDeltaProps {
  value: number;
  className?: string;
}

/** "+8" in accent-text, "−6" in muted (a loss is information, not punishment), "±0" (DESIGN §5.13). */
export function RatingDelta({ value, className }: RatingDeltaProps) {
  const n = Math.round(value);
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-sm px-1.5 text-body-sm font-semibold tabular-nums',
        n > 0 ? 'text-accent-text' : 'text-muted',
        className,
      )}
    >
      {formatDelta(n)}
    </span>
  );
}

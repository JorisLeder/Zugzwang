import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Props of `ProgressBar`. */
export interface ProgressBarProps {
  /** Current value; omit for an indeterminate bar. */
  value?: number;
  max?: number;
  /** Visible text label next to the bar ("Analyse läuft … 18 von 40 Zügen"); also the accessible name. */
  label: string;
  /** Hide the visible label (still announced). */
  hideLabel?: boolean;
  className?: string;
}

/** Linear progress bar: 6 px, track `surface-3`, fill `accent` (DESIGN §5.6). */
export function ProgressBar({ value, max = 100, label, hideLabel = false, className }: ProgressBarProps) {
  const pct = value === undefined ? undefined : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn('h-full rounded-full bg-accent transition-[width] duration-[var(--zz-dur-slow)] ease-out', pct === undefined && 'w-1/3 animate-pulse')}
          style={pct === undefined ? undefined : { width: `${pct}%` }}
        />
      </div>
      {!hideLabel && <span className="shrink-0 text-body-sm text-muted tabular-nums">{label}</span>}
    </div>
  );
}

/** Props of `ProgressRing`. */
export interface ProgressRingProps {
  value: number;
  max: number;
  /** 40, 72 or 120 px (DESIGN §5.6). */
  size?: 40 | 72 | 120;
  /** Accessible name, e.g. "Tagesziel: 12 von 20 Minuten". */
  label: string;
  /** Centre text, e.g. "12/20" (shown at 72/120 px). */
  centerText?: string;
  /** Caption under the centre text, e.g. "Min.". */
  centerCaption?: string;
  className?: string;
}

const STROKE: Record<40 | 72 | 120, number> = { 40: 4, 72: 6, 120: 8 };

/** Circular progress (daily goal). Completed: full ring and a check icon. */
export function ProgressRing({ value, max, size = 72, label, centerText, centerCaption, className }: ProgressRingProps) {
  const stroke = STROKE[size];
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const done = fraction >= 1;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--zz-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--zz-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-[var(--zz-dur-slow)] ease-out"
        />
      </svg>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        {done ? (
          <Check className={size === 40 ? 'size-4 text-accent-text' : 'size-7 text-accent-text'} />
        ) : (
          size !== 40 && (
            <>
              {centerText && <span className="text-body font-semibold tabular-nums">{centerText}</span>}
              {centerCaption && <span className="text-caption text-muted">{centerCaption}</span>}
            </>
          )
        )}
      </div>
    </div>
  );
}

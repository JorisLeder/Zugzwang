import { cn } from '@/lib/cn';
import { PRIMITIVES_DE } from './strings.de';

/** Props of `Spinner`. */
export interface SpinnerProps {
  /** Size in px (default 20). */
  size?: number;
  /** Accessible label; without it the spinner is decorative (`aria-hidden`). */
  label?: string;
  className?: string;
}

/** Loading indicator (the only allowed repeating motion besides skeletons, DESIGN §6.1). */
export function Spinner({ size = 20, label, className }: SpinnerProps) {
  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin text-current', className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (!label) return svg;
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {svg}
      <span className="sr-only">{label || PRIMITIVES_DE.loading}</span>
    </span>
  );
}

import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PRIMITIVES_DE } from './strings.de';

/** Props of `Stars`. */
export interface StarsProps {
  /** Earned stars 0–3. */
  value: number;
  max?: number;
  /** 24 px in lists, 40 px on the completion sheet. */
  size?: 24 | 40;
  className?: string;
}

/** Lesson stars: earned = filled warning with warning-text stroke; not earned = outline border-strong (DESIGN §5.13). */
export function Stars({ value, max = 3, size = 24, className }: StarsProps) {
  const earned = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span role="img" aria-label={PRIMITIVES_DE.stars(earned, max)} className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          width={size}
          height={size}
          strokeWidth={1.5}
          className={i < earned ? 'fill-warning text-warning-text' : 'fill-transparent text-border-strong'}
        />
      ))}
    </span>
  );
}

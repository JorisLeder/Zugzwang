import type { ButtonHTMLAttributes, HTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';
import { badgeVariants, type BadgeVariantProps } from './variants';

/** Props of `Badge`. */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, BadgeVariantProps {}

/** Small pill label (e.g. "vorläufig", "Lokal"). Colour is never the only signal – always words. */
export function Badge({ tone, className, ...rest }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...rest} />;
}

/** Props of `Chip`. */
export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Toggle state (filters); sets `aria-pressed`. */
  selected?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Motif/filter chip: `surface-2`, `rounded-sm`, 28 px (36 px on touch), body-sm 500 (DESIGN §5.13). */
export function Chip({ selected, className, ref, ...rest }: ChipProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-sm border border-transparent bg-surface-2 px-2.5 text-body-sm font-medium text-text pointer-coarse:h-9',
        'hover:bg-surface-3 aria-pressed:border-accent aria-pressed:bg-accent-subtle aria-pressed:text-accent-text',
        className,
      )}
      {...rest}
    />
  );
}

/** Non-interactive chip (tag). */
export function Tag({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex h-7 items-center rounded-sm bg-surface-2 px-2.5 text-body-sm font-medium text-text', className)} {...rest} />;
}

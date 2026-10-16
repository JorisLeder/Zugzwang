import { Slot } from 'radix-ui';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Props of `Card` (DESIGN §5.2). */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Whole card is one link/button (pass it as the only child with `asChild`). Adds hover and focus styles. */
  interactive?: boolean;
  /** Dashboard hero card: 2 px accent left border. */
  hero?: boolean;
  /** Render the child element (e.g. `<Link>`) as the card. */
  asChild?: boolean;
  children?: ReactNode;
}

/** Surface card: `bg-surface`, `rounded-lg`, 1 px border, `shadow-1`, padding 16/20. */
export function Card({ interactive = false, hero = false, asChild = false, className, ...rest }: CardProps) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      className={cn(
        'block rounded-lg border border-border bg-surface p-4 text-text shadow-1 md:p-5',
        interactive && 'cursor-pointer transition-colors duration-[var(--zz-dur-fast)] hover:bg-surface-2',
        hero && 'border-l-2 border-l-accent',
        className,
      )}
      {...rest}
    />
  );
}

/** Card title (h3 style). */
export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-h3 text-text', className)} {...rest}>
      {children}
    </h3>
  );
}

/** One-line meta text under a card title. */
export function CardMeta({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-body-sm text-muted', className)} {...rest} />;
}

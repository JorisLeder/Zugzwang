import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';
import { buttonVariants, type ButtonVariantProps } from './variants';

/** Props of `Button` (DESIGN §5.1). */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {
  /** Leading icon (lucide element). Replaced by a spinner while `loading`. */
  icon?: ReactNode;
  /** Shows a spinner, sets `aria-busy` and blocks clicks; the label stays. */
  loading?: boolean;
  /** Render the child element (e.g. a router `<Link>`) with button styles. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Button with variants primary (one per view), secondary, ghost, danger, link and sizes sm/md/lg.
 * Labels are verbs ("Partie starten"), never "OK".
 */
export function Button({ variant, size, fullWidth, icon, loading = false, asChild = false, className, children, disabled, onClick, ref, ...rest }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...rest}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 22 : size === 'sm' ? 16 : 20} /> : icon}
      {children}
    </button>
  );
}

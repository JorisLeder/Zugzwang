import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './Tooltip';

/** Props of `IconButton`. */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** German accessible name – required (DESIGN §5.1). Also used as tooltip. */
  label: string;
  /** lucide icon element. */
  icon: ReactNode;
  variant?: 'ghost' | 'secondary' | 'primary';
  /** `sm` = 36 px visual (44 px hit area via padding on touch), `md` = 44 px. */
  size?: 'sm' | 'md';
  /** Show the label as tooltip on hover/focus (default true). */
  tooltip?: boolean;
  /** For toggle buttons. */
  pressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Square icon-only button with a German `aria-label` and tooltip. */
export function IconButton({ label, icon, variant = 'ghost', size = 'md', tooltip = true, pressed, className, ref, ...rest }: IconButtonProps) {
  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-[var(--zz-dur-fast)]',
        size === 'md' ? 'size-11 [&_svg]:size-5' : 'size-9 pointer-coarse:size-11 [&_svg]:size-4',
        variant === 'ghost' && 'text-text hover:bg-surface-2 active:bg-surface-3 aria-pressed:bg-surface-3',
        variant === 'secondary' && 'bg-surface-3 text-text hover:bg-[color-mix(in_srgb,var(--zz-surface-3),var(--zz-text)_6%)]',
        variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent-hover',
        'disabled:bg-transparent disabled:text-disabled',
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}

import { Switch as RadixSwitch } from 'radix-ui';
import { useId } from 'react';
import { cn } from '@/lib/cn';

/** Props of `Switch`. */
export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label. */
  label: string;
  /** One-line description under the label (settings rows, DESIGN §3.6). */
  description?: string;
  disabled?: boolean;
  className?: string;
}

/** Settings row with a switch on the right: 44 × 26 px track in a 44 × 44 px hit area, on = accent, thumb white. */
export function Switch({ checked, onCheckedChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4', className)}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer text-body text-text">
          {label}
        </label>
        {description && (
          <p id={descId} className="text-body-sm text-muted">
            {description}
          </p>
        )}
      </div>
      <RadixSwitch.Root
        id={id}
        aria-describedby={description ? descId : undefined}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          // 44 × 44 px touch target; the 44 × 26 px track is drawn by ::before, which also carries the focus ring.
          'relative inline-flex size-11 shrink-0 items-center rounded-full focus-visible:outline-none disabled:opacity-60',
          'before:absolute before:inset-x-0 before:top-[9px] before:h-[26px] before:rounded-full before:border before:border-border-strong before:bg-surface-3 before:transition-colors before:duration-[var(--zz-dur-base)]',
          'data-[state=checked]:before:border-accent data-[state=checked]:before:bg-accent',
          'focus-visible:before:outline-2 focus-visible:before:outline-offset-2 focus-visible:before:outline-focus',
        )}
      >
        <RadixSwitch.Thumb className="relative block size-5 translate-x-[3px] rounded-full bg-white shadow-1 transition-transform duration-[var(--zz-dur-base)] data-[state=checked]:translate-x-[21px]" />
      </RadixSwitch.Root>
    </div>
  );
}

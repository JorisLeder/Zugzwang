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

/** Settings row with a switch on the right: 44 × 26 px track, on = accent, thumb white. */
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
          'relative inline-flex h-[26px] w-11 shrink-0 items-center rounded-full border border-border-strong bg-surface-3 transition-colors duration-[var(--zz-dur-base)]',
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-60',
        )}
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-1 transition-transform duration-[var(--zz-dur-base)] data-[state=checked]:translate-x-[20px]" />
      </RadixSwitch.Root>
    </div>
  );
}

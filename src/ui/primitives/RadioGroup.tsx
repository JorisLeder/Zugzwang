import { RadioGroup as RadixRadioGroup } from 'radix-ui';
import { useId } from 'react';
import { cn } from '@/lib/cn';

/** One radio option. */
export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Props of `RadioGroup`. */
export interface RadioGroupProps<T extends string> {
  value: T | undefined;
  onValueChange: (value: T) => void;
  options: Array<RadioOption<T>>;
  /** Accessible name of the group. */
  label: string;
  className?: string;
}

/** Vertical list of radio cards (self-assessment, quiz-like choices). Min height 56 px. */
export function RadioGroup<T extends string>({ value, onValueChange, options, label, className }: RadioGroupProps<T>) {
  const base = useId();
  return (
    <RadixRadioGroup.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      aria-label={label}
      className={cn('flex flex-col gap-2', className)}
    >
      {options.map((o, i) => {
        const id = `${base}-${i}`;
        return (
          <label
            key={o.value}
            htmlFor={id}
            className={cn(
              'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border-2 border-transparent bg-surface-2 px-4 py-3',
              'has-[[data-state=checked]]:border-accent has-[:focus-visible]:border-focus',
              o.disabled && 'cursor-not-allowed text-disabled',
            )}
          >
            <RadixRadioGroup.Item
              id={id}
              value={o.value}
              disabled={o.disabled}
              className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong focus-visible:outline-none data-[state=checked]:border-accent"
            >
              <RadixRadioGroup.Indicator className="size-2.5 rounded-full bg-accent" />
            </RadixRadioGroup.Item>
            <span className="min-w-0">
              <span className="block text-body font-medium text-text">{o.label}</span>
              {o.description && <span className="block text-body-sm text-muted">{o.description}</span>}
            </span>
          </label>
        );
      })}
    </RadixRadioGroup.Root>
  );
}

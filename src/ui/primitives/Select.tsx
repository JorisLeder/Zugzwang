import { Check, ChevronDown } from 'lucide-react';
import { Select as RadixSelect } from 'radix-ui';
import { cn } from '@/lib/cn';
import { PRIMITIVES_DE } from './strings.de';

/** One select option. */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** Props of `Select`. */
export interface SelectProps<T extends string> {
  value: T | undefined;
  onValueChange: (value: T) => void;
  options: Array<SelectOption<T>>;
  /** Accessible name. */
  label: string;
  placeholder?: string;
  className?: string;
}

/** Dropdown select (Radix Select), 44 px, `border-strong` outline. */
export function Select<T extends string>({ value, onValueChange, options, label, placeholder, className }: SelectProps<T>) {
  return (
    <RadixSelect.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <RadixSelect.Trigger
        aria-label={label}
        className={cn(
          'inline-flex h-11 min-w-40 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface-2 px-3 text-body text-text',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder ?? PRIMITIVES_DE.selectPlaceholder} />
        <RadixSelect.Icon>
          <ChevronDown aria-hidden="true" className="size-4 text-muted" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className="z-50 min-w-[var(--radix-select-trigger-width)] rounded-md bg-surface-2 p-1 shadow-2">
          <RadixSelect.Viewport>
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex h-11 cursor-pointer select-none items-center rounded-sm pl-8 pr-3 text-body text-text outline-none data-[disabled]:text-disabled data-[highlighted]:bg-surface-3"
              >
                <RadixSelect.ItemIndicator className="absolute left-2 inline-flex">
                  <Check aria-hidden="true" className="size-4 text-accent-text" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

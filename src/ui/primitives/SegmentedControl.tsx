import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/cn';

/** One option of a segmented control. */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** One-line description shown under the control for the selected option. */
  description?: string;
  disabled?: boolean;
}

/** Props of `SegmentedControl`. */
export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  /** Accessible name of the group. */
  label: string;
  className?: string;
}

/** Single-choice segmented control (Hilfe-Stufe, Farbe, difficulty; DESIGN §5.13). */
export function SegmentedControl<T extends string>({ value, onValueChange, options, label, className }: SegmentedControlProps<T>) {
  const selected = options.find((o) => o.value === value);
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <ToggleGroup.Root
        type="single"
        value={value}
        onValueChange={(v) => v && onValueChange(v as T)}
        aria-label={label}
        className="inline-flex w-full rounded-md border border-border-strong p-0.5"
      >
        {options.map((o) => (
          <ToggleGroup.Item
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className={cn(
              'focus-inset h-11 min-w-0 flex-1 truncate rounded-[8px] px-3 text-body-sm font-medium text-text',
              'hover:bg-surface-2 data-[state=on]:bg-accent data-[state=on]:text-on-accent disabled:text-disabled',
            )}
          >
            {o.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      {selected?.description && <p className="text-body-sm text-muted">{selected.description}</p>}
    </div>
  );
}

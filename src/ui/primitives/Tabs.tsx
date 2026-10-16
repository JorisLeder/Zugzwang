import { Tabs as RadixTabs } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Tabs root (Radix Tabs; panel tabs on board screens, DESIGN §3.5). */
export const Tabs = RadixTabs.Root;

/** Tab list. */
export function TabsList({ className, ...rest }: ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn('flex shrink-0 gap-1 border-b border-border', className)} {...rest} />;
}

/** One tab. Active: accent text + 2 px accent underline. */
export function TabsTrigger({ className, ...rest }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'focus-inset -mb-px inline-flex h-11 items-center gap-2 border-b-2 border-transparent px-3 text-body-sm font-medium text-muted',
        'hover:text-text data-[state=active]:border-accent data-[state=active]:text-accent-text',
        className,
      )}
      {...rest}
    />
  );
}

/** Tab panel. */
export function TabsContent({ className, ...rest }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('min-h-0 flex-1 overflow-y-auto', className)} {...rest} />;
}

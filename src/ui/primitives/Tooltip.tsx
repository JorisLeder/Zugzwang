import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ReactNode } from 'react';

/** Props of `Tooltip`. */
export interface TooltipProps {
  /** Tooltip text (never the only source of information, DESIGN §5.1). */
  content: ReactNode;
  /** The trigger element (must accept a ref, e.g. a button). */
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/** Hover/focus tooltip (desktop). Includes its own provider, so it works anywhere. */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={400}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className="z-50 max-w-xs rounded-md bg-surface-3 px-3 py-1.5 text-body-sm text-text shadow-2 pointer-coarse:hidden"
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

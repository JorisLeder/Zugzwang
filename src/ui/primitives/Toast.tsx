import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { Toast as RadixToast } from 'radix-ui';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { PRIMITIVES_DE } from './strings.de';
import { ToastContext, type ToastOptions } from './toastContext';

interface QueuedToast extends ToastOptions {
  id: number;
}


/** Provides `useToast()` and renders the toast viewport. One toast visible at a time (queue). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedToast[]>([]);
  const show = useCallback((t: ToastOptions) => {
    setQueue((q) => [...q, { ...t, id: Date.now() + Math.random() }]);
  }, []);
  const current = queue[0];
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const icon = useMemo(() => {
    if (current?.tone === 'success') return <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-accent-text" />;
    if (current?.tone === 'error') return <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-danger-text" />;
    return <Info aria-hidden="true" className="size-5 shrink-0 text-info-text" />;
  }, [current?.tone]);

  return (
    <ToastContext.Provider value={show}>
      <RadixToast.Provider swipeDirection="down" label={PRIMITIVES_DE.close}>
        {children}
        {current && (
          <RadixToast.Root
            key={current.id}
            duration={current.action ? 6000 : 4000}
            onOpenChange={(open) => !open && dismiss()}
            className="flex items-start gap-3 rounded-md bg-surface-3 px-4 py-3 text-text shadow-2"
          >
            {icon}
            <div className="min-w-0 flex-1">
              <RadixToast.Title className="text-body font-medium">{current.title}</RadixToast.Title>
              {current.description && <RadixToast.Description className="text-body-sm text-muted">{current.description}</RadixToast.Description>}
              {current.action && (
                <RadixToast.Action altText={current.action.label} asChild>
                  <button type="button" className="mt-1 text-body-sm font-medium text-accent-text hover:underline" onClick={current.action.onClick}>
                    {current.action.label}
                  </button>
                </RadixToast.Action>
              )}
            </div>
            <RadixToast.Close aria-label={PRIMITIVES_DE.close} className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:text-text">
              <X aria-hidden="true" className="size-4" />
            </RadixToast.Close>
          </RadixToast.Root>
        )}
        <RadixToast.Viewport
          className={cn(
            'fixed z-70 m-0 flex w-[calc(100%-32px)] max-w-[420px] list-none flex-col gap-2 p-0 outline-none',
            'bottom-[calc(var(--zz-tabbar-h)+16px)] left-1/2 -translate-x-1/2 md:bottom-6 md:left-auto md:right-6 md:translate-x-0',
          )}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

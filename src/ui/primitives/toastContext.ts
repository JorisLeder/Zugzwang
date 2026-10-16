import { createContext, useContext } from 'react';

/** A toast message (system events only – never learning feedback, DESIGN §5.8). */
export interface ToastOptions {
  title: string;
  description?: string;
  tone?: 'info' | 'success' | 'error';
  /** Optional single action (link button). */
  action?: { label: string; onClick: () => void };
}

/** Context set by `ToastProvider`. */
export const ToastContext = createContext<((t: ToastOptions) => void) | null>(null);

/** Returns `toast(options)`. Requires `ToastProvider` (the app root provides it). */
export function useToast(): (t: ToastOptions) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

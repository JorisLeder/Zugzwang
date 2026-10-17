import { useEffect, useRef } from 'react';
import { isOwnKeyTarget } from '@/ui/chess';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Whether a key event belongs to a focused control (buttons, links, fields, the board …). */
export function isControlTarget(target: EventTarget | null): boolean {
  if (isOwnKeyTarget(target)) return true;
  const el = target as HTMLElement | null;
  return !!el && typeof el.closest === 'function' && el.closest('button, a[href], [role="button"], [role="radio"], input, select, textarea') !== null;
}

/** Options of `useShortcut`. */
export interface ShortcutOptions {
  /** Also fire while a button or link has focus (default false – a focused control handles Enter/Space itself). */
  overControls?: boolean;
}

/**
 * Page shortcut on `window` (DESIGN §7.4). `key` is compared case-insensitively for letters (`h`) and exactly for
 * named keys (`Enter`, `ArrowRight`). Inactive while `handler` is `undefined`, with modifier keys and while typing;
 * named keys also leave elements with their own key handling alone (board cursor, tabs, radio groups, dialogs).
 */
export function useShortcut(key: string, handler: (() => void) | undefined, { overControls = false }: ShortcutOptions = {}): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const active = handler !== undefined;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const matches = key.length === 1 ? e.key.toLowerCase() === key.toLowerCase() : e.key === key;
      if (!matches) return;
      if (key.length === 1 ? isTypingTarget(e.target) : isOwnKeyTarget(e.target)) return;
      if (!overControls && isControlTarget(e.target)) return;
      e.preventDefault();
      ref.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, active, overControls]);
}

import { useCallback, useEffect, useState } from 'react';

/** Options of `usePlyNavigation`. */
export interface PlyNavigationOptions {
  /** Number of plies (the last ply index). Ply 0 = start position. */
  maxPly: number;
  /** Initial ply (default: `maxPly`). Uncontrolled mode only. */
  initialPly?: number;
  /** Listen to ArrowLeft/ArrowRight/Home/End on `window` (default true). Ignored while typing in inputs. */
  keyboard?: boolean;
  /** Controlled mode: the current ply (use together with `onPlyChange`). */
  ply?: number;
  /** Controlled mode: called with the new (clamped) ply instead of keeping internal state. */
  onPlyChange?: (ply: number) => void;
}

/** State and actions of the ply navigation. */
export interface PlyNavigation {
  ply: number;
  setPly: (ply: number) => void;
  first: () => void;
  prev: () => void;
  next: () => void;
  last: () => void;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * Elements whose own arrow-key handling wins over the move navigation (WCAG 2.1.4: shortcuts only where they do not
 * collide): text fields, the board (cursor), tabs, menus, list boxes, radio/toggle groups, sliders and dialogs.
 */
const OWN_KEYS_SELECTOR =
  '[data-testid="board"], [role="tablist"], [role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"], [role="group"][data-orientation], [role="slider"], [role="dialog"], [role="alertdialog"]';

/** Whether a key event should be left to the focused element. */
export function isOwnKeyTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  return el.closest(OWN_KEYS_SELECTOR) !== null;
}

/**
 * Navigation through a move list (analysis, demos): ArrowLeft/ArrowRight/Home/End on the page (DESIGN §7.4), not
 * while typing or while a widget with its own arrow keys (board, tabs, menus, dialogs) has the focus.
 * Uncontrolled by default; pass `ply` + `onPlyChange` to keep the ply in your own state.
 */
export function usePlyNavigation({ maxPly, initialPly, keyboard = true, ply: controlledPly, onPlyChange }: PlyNavigationOptions): PlyNavigation {
  const [rawPly, setRawPly] = useState(initialPly ?? maxPly);
  const controlled = onPlyChange !== undefined && controlledPly !== undefined;
  const ply = Math.max(0, Math.min(maxPly, controlled ? controlledPly : rawPly));
  const setPly = useCallback(
    (p: number) => {
      const clamped = Math.max(0, Math.min(maxPly, p));
      if (controlled) onPlyChange?.(clamped);
      else setRawPly(clamped);
    },
    [controlled, maxPly, onPlyChange],
  );
  const first = useCallback(() => setPly(0), [setPly]);
  const last = useCallback(() => setPly(maxPly), [setPly, maxPly]);
  const prev = useCallback(() => setPly(ply - 1), [setPly, ply]);
  const next = useCallback(() => setPly(ply + 1), [setPly, ply]);

  useEffect(() => {
    if (!keyboard) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isOwnKeyTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const action = { ArrowLeft: prev, ArrowRight: next, Home: first, End: last }[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, first, last, next, prev]);

  return { ply, setPly, first, prev, next, last, canPrev: ply > 0, canNext: ply < maxPly };
}

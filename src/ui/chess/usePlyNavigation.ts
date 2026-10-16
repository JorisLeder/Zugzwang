import { useCallback, useEffect, useState } from 'react';

/** Options of `usePlyNavigation`. */
export interface PlyNavigationOptions {
  /** Number of plies (the last ply index). Ply 0 = start position. */
  maxPly: number;
  /** Initial ply (default: `maxPly`). */
  initialPly?: number;
  /** Listen to ArrowLeft/ArrowRight/Home/End on `window` (default true). Ignored while typing in inputs. */
  keyboard?: boolean;
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

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/**
 * Navigation through a move list (analysis, demos): ArrowLeft/ArrowRight/Home/End (DESIGN §7.4).
 * PLACEHOLDER (WP-00) with the final signature – WP-01 owns it from wave 1.
 */
export function usePlyNavigation({ maxPly, initialPly, keyboard = true }: PlyNavigationOptions): PlyNavigation {
  const [rawPly, setRawPly] = useState(initialPly ?? maxPly);
  const ply = Math.max(0, Math.min(maxPly, rawPly));
  const setPly = useCallback((p: number) => setRawPly(Math.max(0, Math.min(maxPly, p))), [maxPly]);
  const first = useCallback(() => setPly(0), [setPly]);
  const last = useCallback(() => setPly(maxPly), [setPly, maxPly]);
  const prev = useCallback(() => setRawPly((p) => Math.max(0, Math.min(maxPly, p) - 1)), [maxPly]);
  const next = useCallback(() => setRawPly((p) => Math.min(maxPly, p + 1)), [maxPly]);

  useEffect(() => {
    if (!keyboard) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
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

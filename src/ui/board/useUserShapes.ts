/**
 * Right-mouse arrows and square marks (P0-03, DESIGN §4.4): right-drag draws an arrow, right-click toggles a square
 * mark; Shift/Alt/Ctrl pick green/blue/yellow; a left click on the board clears everything. Mouse only (no long-press
 * menus on touch in V1).
 */
import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Square } from '@/core/chess';
import { shapeColorFromModifiers, toggleArrow, toggleMark, type UserArrow, type UserMark, type UserShapeColor } from './boardLogic';

function squareFromTarget(target: EventTarget | null, root: HTMLElement | null): Square | null {
  const el = (target as Element | null)?.closest?.('[data-square]');
  if (!el || (root && !root.contains(el))) return null;
  return el.getAttribute('data-square') as Square | null;
}

/** State and pointer handlers of the user shapes. */
export interface UserShapes {
  arrows: UserArrow[];
  marks: UserMark[];
  /** Arrow being drawn (right button held). */
  preview: UserArrow | null;
  clear: () => void;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  };
}

/** Hook for the user's own arrows and marks. `enabled = false` disables drawing (existing shapes are kept hidden). */
export function useUserShapes(rootRef: { current: HTMLElement | null }, enabled: boolean): UserShapes {
  const [arrows, setArrows] = useState<UserArrow[]>([]);
  const [marks, setMarks] = useState<UserMark[]>([]);
  const [drawing, setDrawing] = useState<{ from: Square; over: Square; color: UserShapeColor } | null>(null);

  const clear = useCallback(() => {
    setArrows((a) => (a.length ? [] : a));
    setMarks((m) => (m.length ? [] : m));
    setDrawing(null);
  }, []);

  // Releasing the right button outside the board cancels the arrow.
  useEffect(() => {
    if (!drawing) return undefined;
    const cancel = () => setDrawing(null);
    window.addEventListener('pointerup', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [drawing]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button === 0) {
        clear();
        return;
      }
      if (!enabled || e.button !== 2 || (e.pointerType && e.pointerType !== 'mouse')) return;
      const sq = squareFromTarget(e.target, rootRef.current);
      if (!sq) return;
      setDrawing({ from: sq, over: sq, color: shapeColorFromModifiers(e) });
    },
    [clear, enabled, rootRef],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!drawing) return;
      const sq = squareFromTarget(e.target, rootRef.current);
      if (sq && sq !== drawing.over) setDrawing({ ...drawing, over: sq, color: shapeColorFromModifiers(e) });
    },
    [drawing, rootRef],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!drawing || e.button !== 2) return;
      const to = squareFromTarget(e.target, rootRef.current) ?? drawing.over;
      const color = shapeColorFromModifiers(e);
      if (to === drawing.from) setMarks((m) => toggleMark(m, to, color));
      else setArrows((a) => toggleArrow(a, { from: drawing.from, to, color }));
      setDrawing(null);
    },
    [drawing, rootRef],
  );

  const onContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      if (enabled) e.preventDefault();
    },
    [enabled],
  );

  return {
    arrows: enabled ? arrows : [],
    marks: enabled ? marks : [],
    preview: drawing && drawing.over !== drawing.from ? { from: drawing.from, to: drawing.over, color: drawing.color } : null,
    clear,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onContextMenu },
  };
}

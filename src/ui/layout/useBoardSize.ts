import { useLayoutEffect, useState, type RefObject } from 'react';

/** Inputs of the board size rule (DESIGN §3.3/§3.4). */
export interface BoardSizeInput {
  /** Viewport size. */
  viewportWidth: number;
  viewportHeight: number;
  /** Size of the board area (the column that holds bars + board). */
  areaWidth: number;
  areaHeight: number;
  /** Player bars above and below the board (games, analysis). */
  hasPlayerBars: boolean;
  /** Vertical eval bar next to the board (≥ 768 px). */
  hasEvalBar: boolean;
}

const floor8 = (n: number) => Math.floor(n / 8) * 8;

/**
 * Board size rule:
 * - phone (< 768 px): full viewport width (edge to edge);
 * - tablet (768–1023 px): `min(area width, 100dvh − 220px)`, multiple of 8;
 * - desktop (≥ 1024 px): `min(area height − player bars, area width − eval bar, 960)`, multiple of 8, min 320.
 */
export function computeBoardSize(i: BoardSizeInput): number {
  if (i.viewportWidth < 768) return Math.max(200, Math.floor(i.viewportWidth));
  const evalSpace = i.hasEvalBar ? 24 + 12 : 0;
  if (i.viewportWidth < 1024) {
    return Math.max(320, floor8(Math.min(i.areaWidth - evalSpace, i.viewportHeight - 220, 960)));
  }
  const bars = i.hasPlayerBars ? 2 * 44 : 0;
  return Math.max(320, floor8(Math.min(i.areaHeight - bars, i.areaWidth - evalSpace, 960)));
}

/** Measures the board area with a ResizeObserver and returns the board size in px (320 before layout / in jsdom). */
export function useBoardSize(areaRef: RefObject<HTMLElement | null>, opts: { hasPlayerBars: boolean; hasEvalBar: boolean }): number {
  const [size, setSize] = useState(320);
  const { hasPlayerBars, hasEvalBar } = opts;
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el || typeof window === 'undefined') return undefined;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      // Content box (the area may have a horizontal gutter on tablets).
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) || 0;
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) || 0;
      setSize(
        computeBoardSize({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          areaWidth: rect.width - padX,
          areaHeight: rect.height - padY,
          hasPlayerBars,
          hasEvalBar,
        }),
      );
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [areaRef, hasPlayerBars, hasEvalBar]);
  return size;
}

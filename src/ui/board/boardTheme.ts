/**
 * Board theme mapping (DESIGN §2.2, §4): turns the board tokens into react-chessboard v5 options. Colours are CSS
 * variables, so the board designs Moos (default) and Holz switch through `<html data-board="holz">` (set by the
 * settings effects) without re-rendering the board.
 */
import type { ChessboardOptions } from 'react-chessboard';
import type { Settings } from '@/core/profile';

/** Piece move animation (DESIGN §6.1: 150 ms; 0 when animations are off). */
export const PIECE_ANIMATION_MS = 150;

/** The two board designs offered in the settings ("Brettdesign"). */
export const BOARD_THEMES: ReadonlyArray<{ id: Settings['boardTheme']; labelDe: string }> = [
  { id: 'moos', labelDe: 'Moos' },
  { id: 'holz', labelDe: 'Holz' },
];

const coordinate = {
  fontSize: 12,
  fontWeight: 600,
  lineHeight: '12px',
  position: 'absolute',
  userSelect: 'none',
  pointerEvents: 'none',
} as const;

/**
 * Static react-chessboard options for the current settings: square colours, coordinates inside the board (12 px / 600,
 * 4 px from the edge, colour by square), dragged piece 1.1× with `--zz-shadow-2`, board corners and shadow.
 * Arrows are drawn by our own overlay (exact DESIGN geometry and token colours), so the library's arrows are off.
 */
export function boardThemeOptions({ showCoordinates, animate }: { showCoordinates: boolean; animate: boolean }): Partial<ChessboardOptions> {
  return {
    boardStyle: { borderRadius: 'var(--zz-radius-board)', overflow: 'hidden', boxShadow: 'var(--zz-shadow-board)' },
    lightSquareStyle: { backgroundColor: 'var(--zz-sq-light)' },
    darkSquareStyle: { backgroundColor: 'var(--zz-sq-dark)' },
    lightSquareNotationStyle: { color: 'var(--zz-coord-on-light)' },
    darkSquareNotationStyle: { color: 'var(--zz-coord-on-dark)' },
    alphaNotationStyle: { ...coordinate, bottom: 4, right: 4 },
    numericNotationStyle: { ...coordinate, top: 4, left: 4 },
    showNotation: showCoordinates,
    showAnimations: animate,
    animationDurationInMs: animate ? PIECE_ANIMATION_MS : 0,
    draggingPieceStyle: { transform: 'scale(1.1)', filter: 'drop-shadow(var(--zz-shadow-2))' },
    draggingPieceGhostStyle: { opacity: 0.35 },
    dropSquareStyle: { boxShadow: 'inset 0 0 0 3px var(--zz-board-focus-light)' },
    allowDrawingArrows: false,
    arrows: [],
    clearArrowsOnClick: false,
    clearArrowsOnPositionChange: false,
  };
}

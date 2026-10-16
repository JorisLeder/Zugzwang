/**
 * Minimal board (WP-00, BACKLOG 2.5) – owned by WP-01 from wave 1, which completes it (keyboard, marks, annotations,
 * right-click arrows, sounds, board themes). Built on react-chessboard v5 (`options` prop, @dnd-kit) and
 * `@/lib/chess` for legality.
 *
 * Selector contract (e2e helpers depend on it, keep it): root `data-testid="board"` with `data-orientation` and
 * `data-fen`; every square `data-square="e4"`; every piece `data-piece="wP"`; promotion buttons
 * `data-testid="promotion-q|r|b|n"`.
 */
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chessboard, type ChessboardOptions, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard';
import type { MoveClassification } from '@/core/analysis';
import type { Arrow, Fen, MoveInput, MoveRecord, PromotionPiece, Square, SquareMark } from '@/core/chess';
import { ChessGame } from '@/lib/chess';
import { cn } from '@/lib/cn';
import { useSettings } from '@/app/services';
import { PromotionPicker } from './PromotionPicker';
import { BOARD_DE } from './strings.de';

/** Props of `Board` (final names per WP-01; the minimal version ignores `annotations` and `allowUserArrows`). */
export interface BoardProps {
  /** Position to show. Invalid FENs render without interaction. */
  fen: Fen;
  /** Side at the bottom (default white). */
  orientation?: 'white' | 'black';
  /** Allow moves (default true). Only the side to move can move. */
  interactive?: boolean;
  /** Called with the move after it passed `onMoveAttempt`. `ply` is relative to the shown position (1). */
  onMove?: (move: MoveRecord) => void;
  /** Veto/confirm before commit (coach warning, move confirmation). Return false to reject. */
  onMoveAttempt?: (input: MoveInput) => boolean | Promise<boolean>;
  /** Programmatic arrows. */
  arrows?: Arrow[];
  /** Square highlights. */
  marks?: SquareMark[];
  /** Classification symbols at pieces (WP-01). */
  annotations?: Array<{ square: Square; classification: MoveClassification }>;
  /** Last move highlight. */
  lastMove?: { from: Square; to: Square } | null;
  /** Highlight a king in check (default true). */
  highlightCheck?: boolean;
  /** Right-drag arrows and right-click marks (WP-01). */
  allowUserArrows?: boolean;
  /** Default: settings.showCoordinates. */
  showCoordinates?: boolean;
  /** Default: settings.showLegalMoves. */
  showLegalMoves?: boolean;
  className?: string;
}

const ARROW_VARS: Record<Arrow['kind'], string> = {
  user: '--zz-arrow-user',
  best: '--zz-arrow-best',
  threat: '--zz-arrow-threat',
  hint: '--zz-arrow-hint',
  played: '--zz-arrow-best',
};
const ARROW_FALLBACK: Record<Arrow['kind'], string> = {
  user: 'rgb(242 163 58 / 0.85)',
  best: 'rgb(124 191 74 / 0.90)',
  threat: 'rgb(232 85 58 / 0.85)',
  hint: 'rgb(47 107 255 / 0.85)',
  played: 'rgb(124 191 74 / 0.90)',
};

/** Resolves a board token to a concrete colour (SVG presentation attributes do not resolve `var()` reliably). */
function tokenColor(kind: Arrow['kind']): string {
  if (typeof window === 'undefined') return ARROW_FALLBACK[kind];
  const v = getComputedStyle(document.documentElement).getPropertyValue(ARROW_VARS[kind]).trim();
  return v || ARROW_FALLBACK[kind];
}

const layer = (color: string) => `linear-gradient(${color}, ${color})`;
const DOT = 'radial-gradient(circle closest-side, var(--zz-dot-core) 0 26%, var(--zz-dot-ring) 26% 32%, transparent 32%)';
const CAPTURE =
  'radial-gradient(circle closest-side, transparent 0 79%, var(--zz-dot-ring) 79% 82%, var(--zz-dot-core) 82% 100%, transparent 100%)';
const MARK_LAYERS: Record<SquareMark['kind'], string> = {
  user: layer('var(--zz-mark-red)'),
  'hint-piece': layer('var(--zz-hl-hint-fill)'),
  'hint-target': layer('var(--zz-hl-hint-fill)'),
  danger: layer('var(--zz-hl-wrong)'),
  selected: layer('var(--zz-hl-selected)'),
  'last-move': layer('var(--zz-hl-lastmove)'),
  check: 'var(--zz-hl-check)',
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Interactive chessboard (drag-and-drop and click-click; only legal moves; promotion picker). */
export function Board({
  fen,
  orientation = 'white',
  interactive = true,
  onMove,
  onMoveAttempt,
  arrows,
  marks,
  lastMove,
  highlightCheck = true,
  showCoordinates,
  showLegalMoves,
  className,
}: BoardProps) {
  const id = useId().replace(/:/g, '');
  const settings = useSettings();
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [lastFen, setLastFen] = useState(fen);
  if (fen !== lastFen) {
    // A new position clears selection and an open promotion picker.
    setLastFen(fen);
    setSelected(null);
    setPendingPromotion(null);
  }

  const game = useMemo(() => {
    try {
      return ChessGame.fromFen(fen);
    } catch {
      return null;
    }
  }, [fen]);
  const turn = game?.turn() ?? 'w';
  const canMove = interactive && game !== null && !game.status().isOver;
  const coords = showCoordinates ?? settings.showCoordinates;
  const dots = showLegalMoves ?? settings.showLegalMoves;

  const movesFrom = useCallback((sq: Square) => (game && canMove ? game.legalMoves(sq) : []), [game, canMove]);

  const commit = useCallback(
    async (input: MoveInput) => {
      if (!game) return;
      if (onMoveAttempt && !(await onMoveAttempt(input))) return;
      const probe = ChessGame.fromFen(fen);
      const record = probe.move(input);
      if (record) onMove?.(record);
    },
    [fen, game, onMove, onMoveAttempt],
  );

  const tryMove = useCallback(
    (from: Square, to: Square): boolean => {
      const candidates = movesFrom(from).filter((m) => m.to === to);
      if (candidates.length === 0) return false;
      setSelected(null);
      if (candidates.some((m) => m.isPromotion)) {
        setPendingPromotion({ from, to });
        return false;
      }
      void commit({ from, to });
      return true;
    },
    [commit, movesFrom],
  );

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
      if (!canMove || !targetSquare || sourceSquare === targetSquare) return false;
      return tryMove(sourceSquare as Square, targetSquare as Square);
    },
    [canMove, tryMove],
  );

  const onSquareClick = useCallback(
    ({ square, piece }: SquareHandlerArgs) => {
      if (!canMove) return;
      const sq = square as Square;
      const ownPiece = piece !== null && piece.pieceType[0] === turn;
      if (selected && selected !== sq && tryMove(selected, sq)) return;
      if (selected === sq) {
        setSelected(null);
        return;
      }
      setSelected(ownPiece && movesFrom(sq).length > 0 ? sq : null);
    },
    [canMove, movesFrom, selected, tryMove, turn],
  );

  const squareStyles = useMemo(() => {
    const layers = new Map<string, string[]>();
    const add = (sq: string, value: string) => layers.set(sq, [...(layers.get(sq) ?? []), value]);
    if (lastMove) {
      add(lastMove.from, layer('var(--zz-hl-lastmove)'));
      add(lastMove.to, layer('var(--zz-hl-lastmove)'));
    }
    if (highlightCheck && game?.status().inCheck) {
      const king = (['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const)
        .flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => `${f}${r}` as Square))
        .find((s) => {
          const p = game.pieceAt(s);
          return p?.type === 'k' && p.color === turn;
        });
      if (king) add(king, 'var(--zz-hl-check)');
    }
    for (const m of marks ?? []) add(m.square, MARK_LAYERS[m.kind]);
    if (selected) {
      add(selected, layer('var(--zz-hl-selected)'));
      if (dots) for (const m of movesFrom(selected)) add(m.to, m.isCapture ? CAPTURE : DOT);
    }
    const styles: Record<string, CSSProperties> = {};
    // Later layers are painted on top: CSS lists the top layer first.
    for (const [sq, l] of layers) styles[sq] = { backgroundImage: [...l].reverse().join(', ') };
    return styles;
  }, [dots, game, highlightCheck, lastMove, marks, movesFrom, selected, turn]);

  const chessboardArrows = useMemo(
    () => (arrows ?? []).map((a) => ({ startSquare: a.from, endSquare: a.to, color: tokenColor(a.kind) })),
    [arrows],
  );

  // react-chessboard measures squares to animate; a board without layout (hidden, jsdom) must not animate.
  const rootRef = useRef<HTMLDivElement>(null);
  const [hasLayout, setHasLayout] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const check = () => setHasLayout(el.getBoundingClientRect().width > 0);
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const animate = hasLayout && settings.animations && !prefersReducedMotion() && import.meta.env.VITE_E2E !== '1';

  const options: ChessboardOptions = {
    id: `board-${id}`,
    position: fen,
    boardOrientation: orientation,
    allowDragging: canMove,
    canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === turn,
    onPieceDrop,
    onSquareClick,
    onPieceDrag: ({ square }) => {
      if (square) setSelected(square as Square);
    },
    squareStyles,
    arrows: chessboardArrows,
    allowDrawingArrows: false,
    clearArrowsOnPositionChange: false,
    showNotation: coords,
    showAnimations: animate,
    animationDurationInMs: 150,
    boardStyle: { borderRadius: 'var(--zz-radius-board)', overflow: 'hidden', boxShadow: 'var(--zz-shadow-board)' },
    lightSquareStyle: { backgroundColor: 'var(--zz-sq-light)' },
    darkSquareStyle: { backgroundColor: 'var(--zz-sq-dark)' },
    lightSquareNotationStyle: { color: 'var(--zz-coord-on-light)', fontSize: 12, fontWeight: 600 },
    darkSquareNotationStyle: { color: 'var(--zz-coord-on-dark)', fontSize: 12, fontWeight: 600 },
    dropSquareStyle: { boxShadow: 'inset 0 0 0 3px var(--zz-board-focus-light)' },
  };

  return (
    <div
      ref={rootRef}
      data-testid="board"
      data-orientation={orientation}
      data-fen={fen}
      role="region"
      aria-label={BOARD_DE.boardLabel(orientation)}
      className={cn('relative aspect-square w-full select-none', className)}
    >
      <Chessboard options={options} />
      {pendingPromotion && (
        <PromotionPicker
          square={pendingPromotion.to}
          color={turn}
          orientation={orientation}
          onCancel={() => setPendingPromotion(null)}
          onSelect={(piece: PromotionPiece) => {
            const move = { ...pendingPromotion, promotion: piece };
            setPendingPromotion(null);
            void commit(move);
          }}
        />
      )}
    </div>
  );
}

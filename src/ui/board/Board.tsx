/**
 * The chessboard of every board screen (P0-03, DESIGN §2.2/§4/§7). Built on react-chessboard v5 (`options` prop,
 * dnd-kit) with `@/lib/chess` for legality – the board never decides chess rules itself.
 *
 * Selector contract (e2e helpers depend on it, keep it): root `data-testid="board"` with `data-orientation` and
 * `data-fen`; every square `data-square="e4"`; every piece `data-piece="wP"`; promotion buttons
 * `data-testid="promotion-q|r|b|n"`. Extra test hooks: `data-highlights` on the inner square element,
 * `data-arrow`/`data-arrow-source`/`data-arrow-kind` on arrows, `data-annotation`, `data-feedback`, `board-cursor`.
 * API documentation: `src/ui/board/README.md`.
 */
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Chessboard, type ChessboardOptions, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard';
import type { MoveClassification } from '@/core/analysis';
import { type Arrow, type Color, type Fen, type MoveInput, type MoveRecord, type PieceSymbol, type PromotionPiece, type Square, type SquareMark } from '@/core/chess';
import { boardPieces, ChessGame, kingSquare } from '@/lib/chess';
import { cn } from '@/lib/cn';
import { useSettings } from '@/app/services';
import { playSound, soundForMove } from '@/ui/sound';
import { AnnotationBadge, BoardArrows, FeedbackBadge, KeyboardCursor, type OverlayArrow } from './BoardOverlays';
import {
  castlingByRook,
  describeMoveDe,
  findMoveBetween,
  moveCursor,
  squareLabelDe,
  squareLayers,
  USER_ARROW_VARS,
  type BoardFeedback,
  type CursorKey,
} from './boardLogic';
import { boardThemeOptions } from './boardTheme';
import { PromotionPicker } from './PromotionPicker';
import { BOARD_DE } from './strings.de';
import { useDndAccessibilityFix, useElementWidth } from './useBoardDom';
import { useUserShapes } from './useUserShapes';

/** Props of `Board`. */
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
  /** Programmatic arrows (colour by `kind`, DESIGN §2.2). */
  arrows?: Arrow[];
  /** Square highlights (hints, danger, …). */
  marks?: SquareMark[];
  /** Classification symbols at the destination square (DESIGN §4.5; pass only the current move's). */
  annotations?: Array<{ square: Square; classification: MoveClassification }>;
  /** Last move highlight. */
  lastMove?: { from: Square; to: Square } | null;
  /** Highlight a king in check (default true). */
  highlightCheck?: boolean;
  /** Right-drag arrows and right-click marks on desktop (default true). */
  allowUserArrows?: boolean;
  /** Default: settings.showCoordinates. */
  showCoordinates?: boolean;
  /** Default: settings.showLegalMoves. */
  showLegalMoves?: boolean;
  /** Correct/wrong feedback on a square (puzzles, lessons; DESIGN §4.4). */
  feedback?: BoardFeedback | null;
  /** Called by the `F` key while the board has focus (DESIGN §7.4). The parent flips `orientation`. */
  onFlip?: () => void;
  /**
   * Called for every click/tap or keyboard activation (Enter/Space) of a square – also when not `interactive`
   * (position editor, "click the square" tasks).
   */
  onSquareClick?: (square: Square) => void;
  /** Play the move/capture/check sound for moves made on the board (default true; respects settings.sound). */
  sound?: boolean;
  /** Accessible name (default "Schachbrett, du spielst Weiß/Schwarz"). */
  label?: string;
  className?: string;
}

const ARROW_VARS: Record<Arrow['kind'], string> = {
  user: '--zz-arrow-user',
  best: '--zz-arrow-best',
  threat: '--zz-arrow-threat',
  hint: '--zz-arrow-hint',
  played: '--zz-mark-yellow',
};

const CURSOR_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

/** Interactive chessboard: drag-and-drop, click-click, touch and keyboard; only legal moves; promotion picker. */
export function Board({
  fen,
  orientation = 'white',
  interactive = true,
  onMove,
  onMoveAttempt,
  arrows,
  marks,
  annotations,
  lastMove,
  highlightCheck = true,
  allowUserArrows = true,
  showCoordinates,
  showLegalMoves,
  feedback,
  onFlip,
  onSquareClick,
  sound = true,
  label,
  className,
}: BoardProps) {
  const id = useId().replace(/:/g, '');
  const settings = useSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  const fenRef = useRef(fen);
  useLayoutEffect(() => {
    fenRef.current = fen;
  }, [fen]);
  const committing = useRef(false);

  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square; viaKeyboard: boolean } | null>(null);
  const [cursor, setCursor] = useState<Square | null>(null);
  const [focused, setFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [lastFen, setLastFen] = useState(fen);
  const shapes = useUserShapes(rootRef, allowUserArrows);
  if (fen !== lastFen) {
    // A new position clears selection, an open promotion picker and the user's arrows/marks, and announces the move
    // that led to it (user, opponent or a single step forward).
    const move = findMoveBetween(lastFen, fen);
    setLastFen(fen);
    setSelected(null);
    setPendingPromotion(null);
    setAnnouncement(move ? describeMoveDe(move) : '');
    shapes.clear();
  }

  const width = useElementWidth(rootRef);
  useDndAccessibilityFix(rootRef);

  const game = useMemo(() => {
    try {
      return ChessGame.fromFen(fen);
    } catch {
      return null;
    }
  }, [fen]);
  const pieces = useMemo(() => {
    const map = new Map<Square, { type: PieceSymbol; color: Color }>();
    for (const p of boardPieces(fen)) map.set(p.square, { type: p.type, color: p.color });
    return map;
  }, [fen]);
  const turn: Color = game?.turn() ?? 'w';
  const status = useMemo(() => game?.status() ?? null, [game]);
  const canMove = interactive && game !== null && status !== null && !status.isOver;
  const coords = showCoordinates ?? settings.showCoordinates;
  const dots = showLegalMoves ?? settings.showLegalMoves;
  const activeSelection = canMove ? selected : null;

  const movesFrom = useCallback((sq: Square) => (game && canMove ? game.legalMoves(sq) : []), [game, canMove]);
  const targets = useMemo(() => (activeSelection ? movesFrom(activeSelection) : []), [activeSelection, movesFrom]);

  const commit = useCallback(
    async (input: MoveInput) => {
      if (committing.current) return;
      const fenAtStart = fen;
      committing.current = true;
      try {
        if (onMoveAttempt && !(await onMoveAttempt(input))) return;
        if (fenRef.current !== fenAtStart) return; // the position changed meanwhile (opponent, navigation)
        const record = ChessGame.fromFen(fenAtStart).move(input);
        if (!record) return;
        if (sound) playSound(soundForMove(record));
        onMove?.(record);
      } catch (e) {
        // A failing veto counts as "not allowed"; report it so the bug is visible.
        console.error('Board: move handler failed', e);
      } finally {
        committing.current = false;
      }
    },
    [fen, onMove, onMoveAttempt, sound],
  );

  /** Tries `from → to`; returns true when the move was committed (false: illegal, or the promotion picker opened). */
  const tryMove = useCallback(
    (from: Square, to: Square, viaKeyboard = false): boolean => {
      const legal = movesFrom(from);
      let candidates = legal.filter((m) => m.to === to);
      if (candidates.length === 0) {
        const castle = castlingByRook(legal, from, to, pieces.get(from), pieces.get(to));
        if (castle) candidates = [castle];
      }
      if (candidates.length === 0) return false;
      setSelected(null);
      const first = candidates[0]!;
      if (candidates.some((m) => m.isPromotion)) {
        setPendingPromotion({ from, to: first.to, viaKeyboard });
        return false;
      }
      void commit({ from, to: first.to });
      return true;
    },
    [commit, movesFrom, pieces],
  );

  const activateSquare = useCallback(
    (sq: Square, viaKeyboard: boolean) => {
      onSquareClick?.(sq);
      setCursor(sq);
      if (!canMove) return;
      if (activeSelection && activeSelection !== sq && tryMove(activeSelection, sq, viaKeyboard)) return;
      if (activeSelection === sq) {
        setSelected(null);
        return;
      }
      const piece = pieces.get(sq);
      const own = piece !== undefined && piece.color === turn;
      if (activeSelection && !own) {
        // A click on an unreachable square while a piece is selected only clears the selection.
        setSelected(null);
        return;
      }
      setSelected(own && movesFrom(sq).length > 0 ? sq : null);
    },
    [activeSelection, canMove, movesFrom, onSquareClick, pieces, tryMove, turn],
  );

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
      if (!canMove || !targetSquare || sourceSquare === targetSquare) return false;
      return tryMove(sourceSquare as Square, targetSquare as Square);
    },
    [canMove, tryMove],
  );

  const initialCursor = useCallback((): Square => {
    if (activeSelection) return activeSelection;
    if (lastMove) return lastMove.to;
    return kingSquare(fen, orientation === 'white' ? 'w' : 'b') ?? (orientation === 'white' ? 'e1' : 'e8');
  }, [activeSelection, fen, lastMove, orientation]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    if (CURSOR_KEYS.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      setCursorVisible(true);
      setCursor(moveCursor(cursor ?? initialCursor(), e.key as CursorKey, orientation));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      setCursorVisible(true);
      activateSquare(cursor ?? initialCursor(), true);
      return;
    }
    if (e.key === 'Escape' && activeSelection) {
      e.preventDefault();
      e.stopPropagation();
      setSelected(null);
      return;
    }
    if ((e.key === 'f' || e.key === 'F') && onFlip) {
      e.preventDefault();
      e.stopPropagation();
      onFlip();
    }
  };

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    setFocused(true);
    setCursorVisible(isFocusVisible(e.currentTarget));
    if (!cursor) setCursor(initialCursor());
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    setFocused(false);
  };

  const checkSquare = highlightCheck && status?.inCheck ? kingSquare(fen, turn) : null;
  const visuals = useMemo(
    () =>
      squareLayers({
        lastMove,
        checkSquare,
        marks,
        userMarks: shapes.marks,
        feedback,
        selected: activeSelection,
        targets,
        showDots: dots,
      }),
    [lastMove, checkSquare, marks, shapes.marks, feedback, activeSelection, targets, dots],
  );
  const targetSet = useMemo(() => new Set(targets.map((t) => t.to)), [targets]);

  const squareRenderer = ({ square, children }: SquareHandlerArgs & { children?: ReactNode }) => {
    const sq = square as Square;
    const visual = visuals.get(sq);
    return (
      <div
        id={`${id}-sq-${sq}`}
        role="button"
        aria-label={squareLabelDe(sq, pieces.get(sq), { selected: activeSelection === sq, target: targetSet.has(sq) })}
        data-highlights={visual?.tokens.join(' ') || undefined}
        style={{ width: '100%', height: '100%', backgroundImage: visual?.backgroundImage, boxShadow: visual?.boxShadow }}
      >
        {children}
      </div>
    );
  };

  const overlayArrows: OverlayArrow[] = [
    ...(arrows ?? []).map((a) => ({ from: a.from, to: a.to, colorVar: ARROW_VARS[a.kind], source: 'program' as const, kind: a.kind })),
    ...shapes.arrows.map((a) => ({ from: a.from, to: a.to, colorVar: USER_ARROW_VARS[a.color], source: 'user' as const, kind: a.color })),
    ...(shapes.preview
      ? [{ from: shapes.preview.from, to: shapes.preview.to, colorVar: USER_ARROW_VARS[shapes.preview.color], source: 'preview' as const, kind: shapes.preview.color }]
      : []),
  ];

  // react-chessboard measures squares to animate; a board without layout (hidden, jsdom) must not animate.
  const animate = width > 0 && settings.animations && !prefersReducedMotion() && import.meta.env.VITE_E2E !== '1';
  const boardPx = width > 0 ? width : 320;

  const options: ChessboardOptions = {
    ...boardThemeOptions({ showCoordinates: coords, animate }),
    id: `board-${id}`,
    position: fen,
    boardOrientation: orientation,
    allowDragging: canMove,
    canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === turn,
    onPieceDrop,
    onSquareClick: ({ square }) => activateSquare(square as Square, false),
    onPieceDrag: ({ square }) => {
      if (square && canMove) setSelected(square as Square);
    },
    squareRenderer,
  };

  const cursorSquare = focused && cursor ? cursor : null;
  const instructionsId = `${id}-instructions`;

  // The board is one keyboard widget (DESIGN §7.4, WAI-ARIA "application" with aria-activedescendant): one tab stop,
  // arrow keys move the cursor, Enter/Space select and move. jsx-a11y does not count `application` as interactive.
  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- see above */
  return (
    <div
      ref={rootRef}
      data-testid="board"
      data-orientation={orientation}
      data-fen={fen}
      role="application"
      aria-roledescription={BOARD_DE.boardRoleDescription}
      aria-label={label ?? BOARD_DE.boardLabel(orientation)}
      aria-describedby={instructionsId}
      aria-activedescendant={cursorSquare ? `${id}-sq-${cursorSquare}` : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      {...shapes.handlers}
      className={cn('relative isolate aspect-square w-full select-none outline-none', className)}
    >
      <Chessboard options={options} />
      <BoardArrows arrows={overlayArrows} orientation={orientation} />
      {(annotations ?? []).map((a) => (
        <AnnotationBadge
          key={`${a.square}-${a.classification}`}
          square={a.square}
          classification={a.classification}
          orientation={orientation}
          boardPx={boardPx}
          animate={animate}
        />
      ))}
      {feedback && (
        <FeedbackBadge
          key={`${feedback.square}-${feedback.result}`}
          square={feedback.square}
          result={feedback.result}
          label={feedback.result === 'correct' ? BOARD_DE.feedbackCorrect : BOARD_DE.feedbackWrong}
          orientation={orientation}
          boardPx={boardPx}
          animate={animate}
        />
      )}
      {cursorSquare && cursorVisible && <KeyboardCursor square={cursorSquare} orientation={orientation} />}
      {pendingPromotion && (
        <PromotionPicker
          square={pendingPromotion.to}
          color={turn}
          orientation={orientation}
          onCancel={() => {
            const viaKeyboard = pendingPromotion.viaKeyboard;
            setPendingPromotion(null);
            if (viaKeyboard) rootRef.current?.focus({ preventScroll: true });
          }}
          onSelect={(piece: PromotionPiece) => {
            const { from, to, viaKeyboard } = pendingPromotion;
            setPendingPromotion(null);
            if (viaKeyboard) rootRef.current?.focus({ preventScroll: true });
            void commit({ from, to, promotion: piece });
          }}
        />
      )}
      <p id={instructionsId} className="sr-only">
        {BOARD_DE.instructions}
        {onFlip ? ` ${BOARD_DE.instructionsFlip}` : ''}
      </p>
      <p role="status" aria-live="polite" data-testid="board-announcer" className="sr-only">
        {announcement}
      </p>
    </div>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}

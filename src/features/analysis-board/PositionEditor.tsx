import { CircleAlert, CircleCheck, Eraser, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { Color, Fen, Square } from '@/core/chess';
import { pieceNameDe } from '@/lib/chess';
import { cn } from '@/lib/cn';
import { Board, FlipBoardButton, PieceIcon, squareLabelDe, type Orientation } from '@/ui/board';
import { BoardLayout } from '@/ui/layout';
import { Button, IconButton, SegmentedControl, Select } from '@/ui/primitives';
import {
  castlingAvailable,
  clearBoard,
  editorFen,
  editorFromFen,
  enPassantOptions,
  PALETTE,
  placeOnSquare,
  startPosition,
  validateEditor,
  type CastlingFlag,
  type EditorTool,
} from './editorLogic';
import { STRINGS_DE } from './strings.de';

/** Props of `PositionEditor`. */
export interface PositionEditorProps {
  /** Position to start editing from. */
  initialFen: Fen;
  orientation: Orientation;
  onFlip: () => void;
  backTo: string;
  menu?: ReactNode;
  /** Called with the validated FEN. */
  onApply: (fen: Fen) => void;
  onCancel: () => void;
}

const CASTLING: Array<{ flag: CastlingFlag; label: string }> = [
  { flag: 'K', label: STRINGS_DE.castleWK },
  { flag: 'Q', label: STRINGS_DE.castleWQ },
  { flag: 'k', label: STRINGS_DE.castleBK },
  { flag: 'q', label: STRINGS_DE.castleBQ },
];

/**
 * "Stellung aufbauen" (PRD §6 Analysebrett): place/remove pieces, side to move, castling rights and en-passant square.
 * The position is checked live with `validateFen`; illegal positions show the German reason and cannot be applied.
 * Squares are activated by click/tap or with the board's keyboard cursor (Enter/Space).
 */
export function PositionEditor({ initialFen, orientation, onFlip, backTo, menu, onApply, onCancel }: PositionEditorProps) {
  const [state, setState] = useState(() => editorFromFen(initialFen));
  const [tool, setTool] = useState<EditorTool>('wK');
  const [announcement, setAnnouncement] = useState('');
  const fen = editorFen(state);
  const validation = useMemo(() => validateEditor(state), [state]);
  const available = castlingAvailable(state.pieces);
  const epOptions = enPassantOptions(state.pieces, state.turn);
  const epValue = state.enPassant !== '-' && epOptions.includes(state.enPassant) ? state.enPassant : 'none';

  const place = (square: Square) => {
    const next = placeOnSquare(state, square, tool);
    setState(next);
    const piece = next.pieces.find((p) => p.square === square);
    setAnnouncement(STRINGS_DE.editorPlaced(square, squareLabelDe(square, piece).split(', ')[1] ?? ''));
  };

  const toolLabel = (t: EditorTool) => {
    if (t === 'erase') return STRINGS_DE.editorErase;
    const color: Color = t[0] as Color;
    const name = pieceNameDe(t[1]!.toLowerCase() as Parameters<typeof pieceNameDe>[0]);
    return STRINGS_DE.editorPiece(`${color === 'w' ? STRINGS_DE.editorWhite : STRINGS_DE.editorBlack}: ${name}`);
  };

  const panel = (
    <div className="flex flex-col gap-5 pb-2">
      <p className="text-body-sm text-muted">{STRINGS_DE.editorHint}</p>
      <div role="group" aria-label={STRINGS_DE.editorPalette} className="grid grid-cols-7 gap-0.5">
        {[...PALETTE.slice(0, 6), 'erase' as const, ...PALETTE.slice(6)].map((t) => (
          <button
            key={t}
            type="button"
            aria-label={toolLabel(t)}
            aria-pressed={tool === t}
            data-tool={t}
            onClick={() => setTool(t)}
            className={cn(
              'focus-inset inline-flex aspect-square min-h-11 min-w-0 items-center justify-center rounded-md border border-border bg-surface-2 p-1 hover:bg-surface-3',
              tool === t && 'border-2 border-accent bg-accent-subtle',
              t === 'erase' && 'row-span-2 aspect-auto',
            )}
          >
            {t === 'erase' ? <Eraser aria-hidden="true" className="size-6 text-text" /> : <PieceIcon piece={t} className="size-full max-h-10 max-w-10" />}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setState({ ...startPosition(), fullmove: 1 })}>
          {STRINGS_DE.editorStart}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setState(clearBoard(state))}>
          {STRINGS_DE.editorClear}
        </Button>
      </div>
      <SegmentedControl
        label={STRINGS_DE.editorTurn}
        value={state.turn}
        onValueChange={(turn) => setState({ ...state, turn })}
        options={[
          { value: 'w', label: STRINGS_DE.whiteToMove },
          { value: 'b', label: STRINGS_DE.blackToMove },
        ]}
      />
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-body-sm font-medium text-text">{STRINGS_DE.editorCastling}</legend>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {CASTLING.map(({ flag, label }) => (
            <label
              key={flag}
              className={cn('flex min-h-11 cursor-pointer items-center gap-3 text-body text-text', !available[flag] && 'cursor-not-allowed text-disabled')}
            >
              <input
                type="checkbox"
                className="size-5 accent-[var(--zz-accent)]"
                checked={state.castling[flag] && available[flag]}
                disabled={!available[flag]}
                onChange={(e) => setState({ ...state, castling: { ...state.castling, [flag]: e.target.checked } })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <span aria-hidden="true" className="text-body-sm font-medium text-text">
          {STRINGS_DE.editorEp}
        </span>
        <Select
          label={STRINGS_DE.editorEp}
          value={epValue}
          onValueChange={(v) => setState({ ...state, enPassant: v === 'none' ? '-' : (v as Square) })}
          options={[{ value: 'none', label: STRINGS_DE.editorEpNone }, ...epOptions.map((sq) => ({ value: sq, label: sq }))]}
        />
      </div>
      <p
        role="status"
        data-testid="editor-validation"
        className={cn('flex items-start gap-2 text-body-sm', validation.ok ? 'text-muted' : 'text-danger-text')}
      >
        {validation.ok ? (
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        ) : (
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        )}
        <span>{validation.ok ? STRINGS_DE.editorValid : validation.errorDe}</span>
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );

  return (
    <BoardLayout
      title={STRINGS_DE.title}
      backTo={backTo}
      menu={menu}
      panelHeader={<h2 className="text-h3 text-text">{STRINGS_DE.editorHeading}</h2>}
      board={
        <Board
          fen={fen}
          orientation={orientation}
          interactive={false}
          onSquareClick={place}
          onFlip={onFlip}
          allowUserArrows={false}
          highlightCheck={false}
          sound={false}
          label={STRINGS_DE.editorBoardLabel}
        />
      }
      panelTabs={panel}
      actions={
        <>
          <IconButton label={STRINGS_DE.editorCancel} icon={<X />} onClick={onCancel} />
          <FlipBoardButton onFlip={onFlip} />
          <Button className="ml-auto" disabled={!validation.ok} onClick={() => validation.ok && onApply(fen)}>
            {STRINGS_DE.editorApply}
          </Button>
        </>
      }
    />
  );
}

import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/app/services';
import { START_FEN, type MoveRecord } from '@/core/chess';
import { DEFAULT_SETTINGS } from '@/core/profile';
import { FakeAudioContext } from '@/ui/sound/fakeAudio';
import { Board, type BoardProps } from './Board';

function square(sq: string): HTMLElement {
  const el = document.querySelector(`[data-testid="board"] [data-square="${sq}"]`);
  if (!el) throw new Error(`square ${sq} not found`);
  return el as HTMLElement;
}

/** The inner square element (accessible name, highlight tokens). */
function cell(sq: string): HTMLElement {
  return square(sq).querySelector('[role="button"]') as HTMLElement;
}

function highlights(sq: string): string[] {
  return (cell(sq).getAttribute('data-highlights') ?? '').split(' ').filter(Boolean);
}

/** Board that applies its own moves (like the analysis board). */
function Harness({ initial = START_FEN, ...props }: Partial<BoardProps> & { initial?: string }) {
  const [fen, setFen] = useState(initial);
  return (
    <Board
      fen={fen}
      {...props}
      onMove={(m) => {
        props.onMove?.(m);
        setFen(m.fenAfter);
      }}
    />
  );
}

async function flush() {
  await act(async () => {});
}

afterEach(() => useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS }));

describe('Board – selector contract and moves', () => {
  it('exposes data-testid, data-orientation, data-fen, data-square and data-piece', () => {
    render(<Board fen={START_FEN} orientation="black" />);
    const board = screen.getByTestId('board');
    expect(board).toHaveAttribute('data-orientation', 'black');
    expect(board).toHaveAttribute('data-fen', START_FEN);
    expect(document.querySelectorAll('[data-square]')).toHaveLength(64);
    expect(square('e2').querySelector('[data-piece="wP"]')).not.toBeNull();
    expect(square('e8').querySelector('[data-piece="bK"]')).not.toBeNull();
    // Black at the bottom: the first rendered square is h1.
    expect(document.querySelectorAll('[data-square]')[0]).toHaveAttribute('data-square', 'h1');
  });

  it('plays a legal move by click-click and ignores illegal targets', async () => {
    const onMove = vi.fn<(m: MoveRecord) => void>();
    render(<Board fen={START_FEN} onMove={onMove} />);
    fireEvent.click(square('e2'));
    fireEvent.click(square('e5'));
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(square('e2'));
    fireEvent.click(square('e4'));
    await flush();
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]![0]).toMatchObject({ uci: 'e2e4', san: 'e4', color: 'w', ply: 1 });
  });

  it('shows the selection and legal-move dots, and hides dots when switched off', () => {
    const { rerender } = render(<Board fen={START_FEN} />);
    fireEvent.click(square('g1'));
    expect(highlights('g1')).toContain('selected');
    expect(highlights('f3')).toContain('move-target');
    expect(highlights('h3')).toContain('move-target');
    expect(cell('f3')).toHaveAccessibleName('f3, leer, Zug möglich');
    rerender(<Board fen={START_FEN} showLegalMoves={false} />);
    expect(highlights('f3')).not.toContain('move-target');
  });

  it('marks capture targets with a ring', () => {
    render(<Board fen="rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" />);
    fireEvent.click(square('e4'));
    expect(highlights('d5')).toContain('capture-target');
    expect(highlights('e5')).toContain('move-target');
  });

  it('does not move the opponent’s pieces or when not interactive', async () => {
    const onMove = vi.fn();
    const { rerender } = render(<Board fen={START_FEN} onMove={onMove} />);
    fireEvent.click(square('e7'));
    fireEvent.click(square('e5'));
    rerender(<Board fen={START_FEN} onMove={onMove} interactive={false} />);
    fireEvent.click(square('e2'));
    fireEvent.click(square('e4'));
    await flush();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('reports square clicks also when not interactive (position editor)', () => {
    const onSquareClick = vi.fn();
    render(<Board fen={START_FEN} interactive={false} onSquareClick={onSquareClick} />);
    fireEvent.click(square('d4'));
    expect(onSquareClick).toHaveBeenCalledWith('d4');
  });

  it('onMoveAttempt can veto a move', async () => {
    const onMove = vi.fn();
    render(<Board fen={START_FEN} onMove={onMove} onMoveAttempt={async () => false} />);
    fireEvent.click(square('g1'));
    fireEvent.click(square('f3'));
    await flush();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('onMoveAttempt receives the move input and can confirm it', async () => {
    const onMove = vi.fn();
    const attempt = vi.fn(async () => true);
    render(<Board fen={START_FEN} onMove={onMove} onMoveAttempt={attempt} />);
    fireEvent.click(square('g1'));
    fireEvent.click(square('f3'));
    await flush();
    expect(attempt).toHaveBeenCalledWith({ from: 'g1', to: 'f3' });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('renders invalid FENs without crashing and without interaction', () => {
    render(<Board fen="4k3/4R3/8/8/8/8/8/4K3 w - - 0 1" />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
    fireEvent.click(square('e7'));
    expect(highlights('e7')).not.toContain('selected');
  });
});

describe('Board – promotion', () => {
  it.each(['q', 'r', 'b', 'n'] as const)('offers all four promotion pieces to White (chooses %s)', async (piece) => {
    render(<Harness initial="8/P6k/8/8/8/8/8/K7 w - - 0 1" />);
    fireEvent.click(square('a7'));
    fireEvent.click(square('a8'));
    for (const p of ['q', 'r', 'b', 'n']) expect(screen.getByTestId(`promotion-${p}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dame' })).toHaveFocus();
    fireEvent.click(screen.getByTestId(`promotion-${piece}`));
    await flush();
    const fen = screen.getByTestId('board').getAttribute('data-fen')!;
    expect(fen.split(' ')[0]!.startsWith(piece.toUpperCase())).toBe(true);
    expect(screen.queryByTestId('promotion-picker')).not.toBeInTheDocument();
  });

  it.each(['q', 'r', 'b', 'n'] as const)('offers all four promotion pieces to Black (chooses %s)', async (piece) => {
    const onMove = vi.fn<(m: MoveRecord) => void>();
    render(<Harness initial="7K/8/8/8/8/8/p7/7k b - - 0 1" onMove={onMove} orientation="black" />);
    fireEvent.click(square('a2'));
    fireEvent.click(square('a1'));
    fireEvent.click(screen.getByTestId(`promotion-${piece}`));
    await flush();
    expect(onMove.mock.calls[0]![0]).toMatchObject({ uci: `a2a1${piece}`, promotion: piece, color: 'b' });
    expect(square('a1').querySelector(`[data-piece="b${piece.toUpperCase()}"]`)).not.toBeNull();
  });

  it('cancelling the promotion returns the pawn (Escape and click outside)', async () => {
    const onMove = vi.fn();
    render(<Board fen="8/P6k/8/8/8/8/8/K7 w - - 0 1" onMove={onMove} />);
    fireEvent.click(square('a7'));
    fireEvent.click(square('a8'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await flush();
    expect(screen.queryByTestId('promotion-picker')).not.toBeInTheDocument();
    fireEvent.click(square('a7'));
    fireEvent.click(square('a8'));
    fireEvent.click(screen.getByRole('button', { name: 'Umwandlung abbrechen' }));
    await flush();
    expect(screen.queryByTestId('promotion-picker')).not.toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();
    expect(square('a7').querySelector('[data-piece="wP"]')).not.toBeNull();
  });

  it('moves between the options with the arrow keys', () => {
    render(<Board fen="8/P6k/8/8/8/8/8/K7 w - - 0 1" />);
    fireEvent.click(square('a7'));
    fireEvent.click(square('a8'));
    fireEvent.keyDown(screen.getByTestId('promotion-q'), { key: 'ArrowDown' });
    expect(screen.getByTestId('promotion-r')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('promotion-r'), { key: 'ArrowUp' });
    expect(screen.getByTestId('promotion-q')).toHaveFocus();
  });
});

describe('Board – castling and en passant (via chess.js)', () => {
  const castleFen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';

  it('castles by moving the king two squares and by clicking the own rook', async () => {
    const onMove = vi.fn<(m: MoveRecord) => void>();
    render(<Board fen={castleFen} onMove={onMove} />);
    fireEvent.click(square('e1'));
    expect(highlights('g1')).toContain('move-target');
    expect(highlights('c1')).toContain('move-target');
    fireEvent.click(square('g1'));
    await flush();
    expect(onMove.mock.calls[0]![0]).toMatchObject({ uci: 'e1g1', san: 'O-O', isCastle: true });
    fireEvent.click(square('e1'));
    fireEvent.click(square('a1'));
    await flush();
    expect(onMove.mock.calls[1]![0]).toMatchObject({ uci: 'e1c1', san: 'O-O-O' });
  });

  it('offers no castling while in check or through an attacked square', () => {
    // In check from the rook on e8 (FIDE 3.8.2.2): no castling at all.
    const { rerender } = render(<Board fen="4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1" />);
    fireEvent.click(square('e1'));
    expect(highlights('g1')).not.toContain('move-target');
    expect(highlights('c1')).not.toContain('move-target');
    // The rook on f8 attacks f1, which the king would cross: only the long castling is legal.
    rerender(<Board fen="5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1" />);
    fireEvent.click(square('e1'));
    expect(highlights('g1')).not.toContain('move-target');
    expect(highlights('c1')).toContain('move-target');
  });

  it('captures en passant only on the immediately following move', async () => {
    const onMove = vi.fn<(m: MoveRecord) => void>();
    const { rerender } = render(<Board fen="rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2" onMove={onMove} />);
    fireEvent.click(square('e5'));
    expect(highlights('d6')).toContain('capture-target');
    fireEvent.click(square('d6'));
    await flush();
    expect(onMove.mock.calls[0]![0]).toMatchObject({ uci: 'e5d6', isEnPassant: true, captured: 'p' });
    // One move pair later the right is gone (no e.p. square in the FEN).
    rerender(<Board fen="rnbqkbnr/ppp1ppp1/7p/3pP3/8/7P/PPPP1PP1/RNBQKBNR w KQkq - 0 3" onMove={onMove} />);
    fireEvent.click(square('e5'));
    expect(highlights('d6')).not.toContain('capture-target');
  });
});

describe('Board – highlights, arrows, marks, annotations', () => {
  it('highlights the last move and a king in check', () => {
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    const { rerender } = render(<Board fen={fen} lastMove={{ from: 'd8', to: 'h4' }} />);
    expect(highlights('d8')).toContain('last-move');
    expect(highlights('h4')).toContain('last-move');
    expect(highlights('e1')).toContain('check');
    rerender(<Board fen={fen} highlightCheck={false} />);
    expect(highlights('e1')).not.toContain('check');
  });

  it('renders programmatic arrows, marks, annotations and feedback distinctly', () => {
    render(
      <Board
        fen={START_FEN}
        arrows={[
          { from: 'g1', to: 'f3', kind: 'best' },
          { from: 'e7', to: 'e5', kind: 'threat' },
          { from: 'b1', to: 'c3', kind: 'hint' },
        ]}
        marks={[
          { square: 'g1', kind: 'hint-piece' },
          { square: 'f3', kind: 'hint-target' },
          { square: 'd4', kind: 'danger' },
        ]}
        annotations={[{ square: 'e4', classification: 'blunder' }]}
        feedback={{ square: 'c4', result: 'wrong' }}
      />,
    );
    const best = document.querySelector('[data-arrow="g1-f3"]') as SVGElement;
    expect(best).toHaveAttribute('data-arrow-kind', 'best');
    expect(best.style.fill).toBe('var(--zz-arrow-best)');
    expect((document.querySelector('[data-arrow="e7-e5"]') as SVGElement).style.fill).toBe('var(--zz-arrow-threat)');
    expect((document.querySelector('[data-arrow="b1-c3"]') as SVGElement).style.fill).toBe('var(--zz-arrow-hint)');
    expect(highlights('g1')).toContain('hint-piece');
    expect(cell('g1').style.boxShadow).toContain('--zz-hint-ring-dark');
    expect(highlights('f3')).toContain('hint-target');
    expect(highlights('d4')).toContain('danger');
    const badge = document.querySelector('[data-annotation="e4"]')!;
    expect(badge.querySelector('[data-classification="blunder"]')).toHaveAccessibleName('Patzer');
    expect(document.querySelector('[data-feedback="wrong"]')).toHaveAccessibleName('Falsch');
    expect(highlights('c4')).toContain('wrong');
  });

  it('draws right-click marks and right-drag arrows, and a left click clears them', () => {
    render(<Board fen={START_FEN} />);
    fireEvent.pointerDown(cell('e4'), { button: 2, pointerType: 'mouse' });
    fireEvent.pointerUp(cell('e4'), { button: 2, pointerType: 'mouse' });
    expect(highlights('e4')).toContain('user-mark-default');
    fireEvent.pointerDown(cell('d4'), { button: 2, pointerType: 'mouse', shiftKey: true });
    fireEvent.pointerUp(cell('d4'), { button: 2, pointerType: 'mouse', shiftKey: true });
    expect(highlights('d4')).toContain('user-mark-green');
    // Right click on a marked square removes the mark.
    fireEvent.pointerDown(cell('e4'), { button: 2, pointerType: 'mouse' });
    fireEvent.pointerUp(cell('e4'), { button: 2, pointerType: 'mouse' });
    expect(highlights('e4')).not.toContain('user-mark-default');

    fireEvent.pointerDown(cell('e2'), { button: 2, pointerType: 'mouse' });
    fireEvent.pointerMove(cell('e3'), { buttons: 2, pointerType: 'mouse' });
    expect(document.querySelector('[data-arrow-source="preview"]')).not.toBeNull();
    fireEvent.pointerUp(cell('e4'), { button: 2, pointerType: 'mouse', altKey: true });
    const arrow = document.querySelector('[data-arrow="e2-e4"]') as SVGElement;
    expect(arrow).toHaveAttribute('data-arrow-source', 'user');
    expect(arrow.style.fill).toBe('var(--zz-mark-blue)');

    fireEvent.pointerDown(cell('a3'), { button: 0, pointerType: 'mouse' });
    expect(document.querySelector('[data-arrow-source="user"]')).toBeNull();
    expect(highlights('d4')).not.toContain('user-mark-green');
  });

  it('does not draw user shapes when disabled or with touch', () => {
    const { rerender } = render(<Board fen={START_FEN} allowUserArrows={false} />);
    fireEvent.pointerDown(cell('e4'), { button: 2, pointerType: 'mouse' });
    fireEvent.pointerUp(cell('e4'), { button: 2, pointerType: 'mouse' });
    expect(highlights('e4')).toEqual([]);
    rerender(<Board fen={START_FEN} />);
    fireEvent.pointerDown(cell('e4'), { button: 2, pointerType: 'touch' });
    fireEvent.pointerUp(cell('e4'), { button: 2, pointerType: 'touch' });
    expect(highlights('e4')).toEqual([]);
  });

  it('shows coordinates per setting/prop', () => {
    const { rerender } = render(<Board fen={START_FEN} showCoordinates />);
    expect(square('a1')).toHaveTextContent('a');
    expect(square('a1')).toHaveTextContent('1');
    rerender(<Board fen={START_FEN} showCoordinates={false} />);
    expect(square('a1')).not.toHaveTextContent('a');
    useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, showCoordinates: false });
    rerender(<Board fen={START_FEN} />);
    expect(square('h1')).not.toHaveTextContent('h');
  });
});

describe('Board – keyboard and screen readers', () => {
  it('selects and moves a piece with the keyboard only', async () => {
    const onMove = vi.fn<(m: MoveRecord) => void>();
    render(<Harness onMove={onMove} />);
    const board = screen.getByTestId('board');
    act(() => board.focus());
    // Cursor starts on the own king.
    expect(board).toHaveAttribute('aria-activedescendant', cell('e1').id);
    fireEvent.keyDown(board, { key: 'ArrowUp' });
    expect(board.getAttribute('aria-activedescendant')).toBe(cell('e2').id);
    expect(cell('e2')).toHaveAccessibleName('e2, weißer Bauer');
    fireEvent.keyDown(board, { key: 'Enter' });
    expect(highlights('e2')).toContain('selected');
    fireEvent.keyDown(board, { key: 'ArrowUp' });
    fireEvent.keyDown(board, { key: 'ArrowUp' });
    fireEvent.keyDown(board, { key: ' ' });
    await flush();
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ uci: 'e2e4' }));
    expect(board).toHaveAttribute('data-fen', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(screen.getByTestId('board-announcer')).toHaveTextContent('Weiß: Bauer nach e4.');
    expect(screen.getByTestId('board-cursor')).toHaveAttribute('data-square-cursor', 'e4');
  });

  it('moves the cursor orientation-aware, Escape clears the selection, F flips', () => {
    const onFlip = vi.fn();
    render(<Board fen={START_FEN} orientation="black" onFlip={onFlip} />);
    const board = screen.getByTestId('board');
    act(() => board.focus());
    expect(board.getAttribute('aria-activedescendant')).toBe(cell('e8').id);
    fireEvent.keyDown(board, { key: 'ArrowUp' });
    expect(board.getAttribute('aria-activedescendant')).toBe(cell('e7').id);
    fireEvent.keyDown(board, { key: 'ArrowRight' });
    expect(board.getAttribute('aria-activedescendant')).toBe(cell('d7').id);
    fireEvent.keyDown(board, { key: 'f' });
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels a keyboard selection', () => {
    render(<Board fen={START_FEN} />);
    const board = screen.getByTestId('board');
    act(() => board.focus());
    fireEvent.keyDown(board, { key: 'ArrowUp' });
    fireEvent.keyDown(board, { key: 'Enter' });
    expect(highlights('e2')).toContain('selected');
    fireEvent.keyDown(board, { key: 'Escape' });
    expect(highlights('e2')).not.toContain('selected');
  });

  it('promotes with the keyboard and returns the focus to the board', async () => {
    render(<Harness initial="8/P6k/8/8/8/8/8/K7 w - - 0 1" />);
    const board = screen.getByTestId('board');
    act(() => board.focus());
    // King a1 → cursor a1; go to a7, select, up to a8.
    for (let i = 0; i < 6; i += 1) fireEvent.keyDown(board, { key: 'ArrowUp' });
    fireEvent.keyDown(board, { key: 'Enter' });
    fireEvent.keyDown(board, { key: 'ArrowUp' });
    fireEvent.keyDown(board, { key: 'Enter' });
    expect(screen.getByTestId('promotion-q')).toHaveFocus();
    fireEvent.click(screen.getByTestId('promotion-q'));
    await flush();
    expect(board).toHaveFocus();
    expect(board.getAttribute('data-fen')!.startsWith('Q7/')).toBe(true);
  });

  it('keeps arrow keys away from page-level shortcuts while the board has focus', () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    render(<Board fen={START_FEN} />);
    const board = screen.getByTestId('board');
    act(() => board.focus());
    fireEvent.keyDown(board, { key: 'ArrowLeft' });
    window.removeEventListener('keydown', onWindowKey);
    expect(onWindowKey).not.toHaveBeenCalled();
  });

  it('labels the board and removes the drag layer from the tab order', () => {
    render(<Board fen={START_FEN} />);
    const board = screen.getByRole('application', { name: 'Schachbrett, du spielst Weiß' });
    expect(board).toHaveAttribute('tabindex', '0');
    const draggables = document.querySelectorAll('[aria-roledescription="draggable"]');
    expect(draggables.length).toBe(32);
    for (const d of draggables) {
      expect(d).not.toHaveAttribute('tabindex');
      expect(d).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('announces opponent moves', () => {
    const { rerender } = render(<Board fen={START_FEN} />);
    rerender(<Board fen="rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1" />);
    expect(screen.getByTestId('board-announcer')).toHaveTextContent('Weiß: Springer nach f3.');
  });
});

describe('Board – sounds', () => {
  beforeAll(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function playE4(props: Partial<BoardProps> = {}) {
    vi.setSystemTime(Date.now() + 1000);
    FakeAudioContext.reset();
    const { unmount } = render(<Board fen={START_FEN} {...props} />);
    fireEvent.click(square('e2'));
    fireEvent.click(square('e4'));
    await flush();
    unmount();
    return FakeAudioContext.started.length;
  }

  it('plays the move sound when sounds are on, never when off or disabled by prop', async () => {
    useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, sound: true });
    expect(await playE4()).toBeGreaterThan(0);
    expect(await playE4({ sound: false })).toBe(0);
    useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, sound: false });
    expect(await playE4()).toBe(0);
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { START_FEN, type MoveRecord } from '@/core/chess';
import { Board } from './Board';

function square(sq: string): HTMLElement {
  const el = document.querySelector(`[data-testid="board"] [data-square="${sq}"]`);
  if (!el) throw new Error(`square ${sq} not found`);
  return el as HTMLElement;
}

describe('Board (minimal, selector contract)', () => {
  it('exposes data-testid, data-orientation, data-fen, data-square and data-piece', () => {
    render(<Board fen={START_FEN} orientation="black" />);
    const board = screen.getByTestId('board');
    expect(board).toHaveAttribute('data-orientation', 'black');
    expect(board).toHaveAttribute('data-fen', START_FEN);
    expect(document.querySelectorAll('[data-square]')).toHaveLength(64);
    expect(square('e2').querySelector('[data-piece="wP"]')).not.toBeNull();
    expect(square('e8').querySelector('[data-piece="bK"]')).not.toBeNull();
  });

  it('plays a legal move by click-click and ignores illegal targets', async () => {
    const onMove = vi.fn<(m: MoveRecord) => void>();
    render(<Board fen={START_FEN} onMove={onMove} />);
    fireEvent.click(square('e2'));
    fireEvent.click(square('e5'));
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(square('e2'));
    fireEvent.click(square('e4'));
    await act(async () => {});
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]![0]).toMatchObject({ uci: 'e2e4', san: 'e4', color: 'w' });
  });

  it('does not move the opponent’s pieces or when not interactive', async () => {
    const onMove = vi.fn();
    const { rerender } = render(<Board fen={START_FEN} onMove={onMove} />);
    fireEvent.click(square('e7'));
    fireEvent.click(square('e5'));
    rerender(<Board fen={START_FEN} onMove={onMove} interactive={false} />);
    fireEvent.click(square('e2'));
    fireEvent.click(square('e4'));
    await act(async () => {});
    expect(onMove).not.toHaveBeenCalled();
  });

  it.each(['q', 'r', 'b', 'n'] as const)('offers all four promotion pieces (chooses %s)', async (piece) => {
    function Harness() {
      const [fen, setFen] = useState('8/P6k/8/8/8/8/8/K7 w - - 0 1');
      return <Board fen={fen} onMove={(m) => setFen(m.fenAfter)} />;
    }
    render(<Harness />);
    fireEvent.click(square('a7'));
    fireEvent.click(square('a8'));
    for (const p of ['q', 'r', 'b', 'n']) expect(screen.getByTestId(`promotion-${p}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dame' })).toHaveFocus();
    fireEvent.click(screen.getByTestId(`promotion-${piece}`));
    await act(async () => {});
    const fen = screen.getByTestId('board').getAttribute('data-fen')!;
    expect(fen.split(' ')[0]!.startsWith(piece.toUpperCase())).toBe(true);
    expect(screen.queryByTestId('promotion-picker')).not.toBeInTheDocument();
  });

  it('cancelling the promotion returns the pawn (Escape)', async () => {
    const onMove = vi.fn();
    render(<Board fen="8/P6k/8/8/8/8/8/K7 w - - 0 1" onMove={onMove} />);
    fireEvent.click(square('a7'));
    fireEvent.click(square('a8'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await act(async () => {});
    expect(screen.queryByTestId('promotion-picker')).not.toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('onMoveAttempt can veto a move', async () => {
    const onMove = vi.fn();
    render(<Board fen={START_FEN} onMove={onMove} onMoveAttempt={async () => false} />);
    fireEvent.click(square('g1'));
    fireEvent.click(square('f3'));
    await act(async () => {});
    expect(onMove).not.toHaveBeenCalled();
  });

  it('renders invalid FENs without crashing and without interaction', () => {
    render(<Board fen="4k3/4R3/8/8/8/8/8/4K3 w - - 0 1" />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });
});

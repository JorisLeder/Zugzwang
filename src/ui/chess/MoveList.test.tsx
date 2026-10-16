import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/app/services';
import { START_FEN } from '@/core/chess';
import { DEFAULT_SETTINGS } from '@/core/profile';
import { ChessGame } from '@/lib/chess';
import { MoveList } from './MoveList';

function history(start: string, moves: string[]) {
  return ChessGame.fromMoves(start, moves).history();
}

// 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Qe7 5. d4
const GAME = history(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1', 'd8e7', 'd2d4']);

afterEach(() => useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS }));

function texts() {
  return screen.getAllByRole('button').map((b) => b.textContent);
}

describe('MoveList', () => {
  it('shows German letters and 0-0 by default (D-23)', () => {
    render(<MoveList moves={GAME} currentPly={9} variant="list" />);
    expect(texts()).toEqual(['e4', 'e5', 'Sf3', 'Sc6', 'Lc4', 'Lc5', '0-0', 'De7', 'd4']);
    const list = screen.getByRole('list', { name: 'Zugliste' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });

  it('shows English letters and O-O when settings.notation = "en"', () => {
    useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, notation: 'en' });
    render(<MoveList moves={GAME} currentPly={9} variant="list" />);
    expect(texts()).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Qe7', 'd4']);
  });

  it('marks the current move, jumps on click and has German screen-reader names', () => {
    const onSelect = vi.fn();
    render(<MoveList moves={GAME} currentPly={3} onSelectPly={onSelect} variant="list" classifications={{ 3: 'best' }} />);
    const current = screen.getByRole('button', { current: 'step' });
    expect(current).toHaveTextContent('Sf3');
    expect(current).toHaveAccessibleName('2. Zug Weiß: Sf3 (Springer f3), Bester Zug');
    expect(within(current).getByRole('img', { name: 'Bester Zug' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^4\. Zug Weiß: 0-0 \(kurze Rochade\)/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sc6/ }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it('starts with "…" when the game starts with Black to move', () => {
    const moves = history('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ['e7e5', 'g1f3']);
    render(<MoveList moves={moves} currentPly={0} variant="list" />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('1.…e5');
    expect(rows[1]).toHaveTextContent('2.Sf3');
  });

  it('renders a horizontal strip on phones', () => {
    render(<MoveList moves={GAME} currentPly={9} variant="strip" />);
    const list = screen.getByRole('list', { name: 'Zugliste' });
    expect(list).toHaveAttribute('data-variant', 'strip');
    expect(texts()).toHaveLength(9);
    expect(screen.getByRole('button', { current: 'step' })).toHaveTextContent('d4');
  });

  it('chooses the strip automatically below 768 px', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...original(q), matches: q === '(max-width: 767px)' })) as typeof window.matchMedia;
    render(<MoveList moves={GAME} currentPly={1} />);
    expect(screen.getByRole('list')).toHaveAttribute('data-variant', 'strip');
    window.matchMedia = original;
  });

  it('honours an explicit notation prop', () => {
    render(<MoveList moves={GAME} currentPly={0} notation="en" variant="list" />);
    expect(texts()[2]).toBe('Nf3');
  });
});

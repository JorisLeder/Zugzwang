import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { Board } from '@/ui/board';
import { NavigationControls } from './NavigationControls';
import { usePlyNavigation } from './usePlyNavigation';

describe('usePlyNavigation', () => {
  it('starts at the end and navigates with ArrowLeft/ArrowRight/Home/End', () => {
    const { result } = renderHook(() => usePlyNavigation({ maxPly: 5 }));
    expect(result.current.ply).toBe(5);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(result.current.ply).toBe(4);
    fireEvent.keyDown(window, { key: 'Home' });
    expect(result.current.ply).toBe(0);
    expect(result.current.canPrev).toBe(false);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(result.current.ply).toBe(1);
    fireEvent.keyDown(window, { key: 'End' });
    expect(result.current.ply).toBe(5);
    expect(result.current.canNext).toBe(false);
    act(() => result.current.setPly(99));
    expect(result.current.ply).toBe(5);
  });

  it('ignores keys while typing, in widgets with own arrow keys and when disabled', () => {
    const { result, rerender } = renderHook(({ keyboard }) => usePlyNavigation({ maxPly: 3, initialPly: 1, keyboard }), {
      initialProps: { keyboard: true },
    });
    render(
      <div>
        <input aria-label="Eingabe" />
        <div role="tablist" aria-label="Reiter">
          <button type="button" role="tab" aria-selected="true">
            A
          </button>
        </div>
        <Board fen={START_FEN} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('tab'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByTestId('board'), { key: 'ArrowRight' });
    expect(result.current.ply).toBe(1);
    rerender({ keyboard: false });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(result.current.ply).toBe(1);
  });
});

describe('NavigationControls', () => {
  it('has German labels and disables the ends', () => {
    let ply = 0;
    const { rerender } = render(<NavigationControls ply={0} maxPly={2} onNavigate={(p) => (ply = p)} />);
    expect(screen.getByRole('button', { name: 'Zum Anfang' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Vor' }));
    expect(ply).toBe(1);
    rerender(<NavigationControls ply={2} maxPly={2} onNavigate={(p) => (ply = p)} />);
    expect(screen.getByRole('button', { name: 'Zum Ende' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zum Anfang' }));
    expect(ply).toBe(0);
  });
});

describe('usePlyNavigation (controlled)', () => {
  it('reports changes through onPlyChange and follows the ply prop', () => {
    const changes: number[] = [];
    const { result, rerender } = renderHook(({ ply, max }) => usePlyNavigation({ maxPly: max, ply, onPlyChange: (p) => changes.push(p) }), {
      initialProps: { ply: 2, max: 2 },
    });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(changes).toEqual([1]);
    expect(result.current.ply).toBe(2);
    // Growing line: the parent sets ply 3 together with maxPly 3.
    rerender({ ply: 3, max: 3 });
    expect(result.current.ply).toBe(3);
    act(() => result.current.setPly(10));
    expect(changes).toEqual([1, 3]);
  });
});

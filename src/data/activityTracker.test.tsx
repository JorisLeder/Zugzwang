import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityTracker } from '@/core/storage';
import { createActivityTracker } from './activity';

function Tracked({ tracker, area }: { tracker: ActivityTracker; area: 'puzzles' | 'play' }) {
  tracker.useTracking(area);
  return <p>{area}</p>;
}

afterEach(() => vi.useRealTimers());

describe('ActivityTracker hook', () => {
  it('counts active minutes once even when two pages track; stops after 60 s without interaction', async () => {
    vi.useFakeTimers();
    const add = vi.fn(async (_m: number) => {});
    const tracker = createActivityTracker(add);
    const { unmount } = render(
      <>
        <Tracked tracker={tracker} area="puzzles" />
        <Tracked tracker={tracker} area="play" />
      </>,
    );
    for (let i = 0; i < 12; i++) {
      act(() => vi.advanceTimersByTime(5000));
      fireEvent.pointerDown(window);
    }
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(1);
    // No interaction: the next 60 s count, after that nothing.
    act(() => vi.advanceTimersByTime(180_000));
    expect(add).toHaveBeenCalledTimes(2);
    unmount();
    act(() => vi.advanceTimersByTime(120_000));
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('does not count while the tab is hidden', () => {
    vi.useFakeTimers();
    const add = vi.fn(async (_m: number) => {});
    const tracker = createActivityTracker(add);
    render(<Tracked tracker={tracker} area="puzzles" />);
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 24; i++) {
      act(() => vi.advanceTimersByTime(5000));
      fireEvent.keyDown(window, { key: 'a' });
    }
    expect(add).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

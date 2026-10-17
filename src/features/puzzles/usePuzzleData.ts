/**
 * Data hooks of the puzzle pages: bank loading (D-25), the live puzzle rating, live theme statistics and the page
 * keyboard shortcuts (DESIGN §7.4: `H` Hinweis, `Enter` Nächstes Puzzle after the end, `F` Brett drehen).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import type { ThemeStat } from '@/core/profile';
import type { RatingRecord } from '@/core/rating';
import { useSubscribable } from '@/lib/observable';
import { countThemePuzzles, loadPuzzleBank, openingTagsForTheme, TRAINABLE_THEMES, type PuzzleBankStatus, type ThemeDifficulty } from '@/puzzles';

/** State of the bank import. */
export type PuzzleBankState = { status: 'loading' } | { status: 'ready'; bank: PuzzleBankStatus } | { status: 'error'; error: unknown };

/**
 * Makes sure the puzzle bank is in the local repository (first start, new manifest version) and reports progress.
 * Offline with a stored bank counts as ready.
 */
export function usePuzzleBank(): PuzzleBankState & { retry: () => void } {
  const { data } = useServices();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ attempt: number; value: PuzzleBankState }>({ attempt: -1, value: { status: 'loading' } });
  useEffect(() => {
    let alive = true;
    loadPuzzleBank(data.repos.puzzles, { baseUrl: import.meta.env.BASE_URL }).then(
      (bank) => alive && setState({ attempt, value: { status: 'ready', bank } }),
      (error: unknown) => {
        console.warn('Puzzle bank could not be loaded', error);
        if (alive) setState({ attempt, value: { status: 'error', error } });
      },
    );
    return () => {
      alive = false;
    };
  }, [data, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const value: PuzzleBankState = state.attempt === attempt ? state.value : { status: 'loading' };
  return { ...value, retry };
}

/** The live puzzle rating: `undefined` while loading, `null` before the self-assessment. */
export function usePuzzleRating(): RatingRecord | null | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.ratings.observe('puzzle'), [data]);
  return useSubscribable<RatingRecord | null | undefined>(source, undefined);
}

/** Live theme statistics (P0-06). */
export function useThemeStats(): ThemeStat[] {
  const { data } = useServices();
  const source = useMemo(() => data.repos.themeStats.observe(), [data]);
  return useSubscribable<ThemeStat[]>(source, []);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return isTypingTarget(target) || target.closest('button, a[href], [role="button"], [role="application"], [role="dialog"]') !== null;
}

/** Page shortcuts of a puzzle screen. Handlers that are `undefined` are inactive. */
export function usePuzzleShortcuts(handlers: { onHint?: () => void; onNext?: () => void; onFlip?: () => void }): void {
  const { onHint, onNext, onFlip } = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'h' && onHint) {
        e.preventDefault();
        onHint();
      } else if (key === 'f' && onFlip) {
        e.preventDefault();
        onFlip();
      } else if (e.key === 'Enter' && onNext && !isInteractive(e.target)) {
        // A focused button handles Enter itself (no double action).
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHint, onNext, onFlip]);
}

/** Marks for the puzzle-switch budget (≤ 300 ms, NFR); harmless where the Performance API is missing. */
export const PERF = {
  next: 'zz-puzzle-next',
  shown: 'zz-puzzle-shown',
  measure: 'zz-puzzle-switch',
} as const;

/** `performance.mark` that never throws. */
export function perfMark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // no Performance API
  }
}

/** Measures from the "Weiter" click to the shown puzzle (if both marks exist). */
export function perfMeasureSwitch(): void {
  try {
    if (performance.getEntriesByName(PERF.next, 'mark').length === 0) return;
    performance.mark(PERF.shown);
    performance.measure(PERF.measure, PERF.next, PERF.shown);
    performance.clearMarks(PERF.next);
  } catch {
    // no Performance API
  }
}

/** Puzzles per trainable theme: without filter (`totals`) and with the difficulty filter (`filtered`). */
export interface ThemeCounts {
  totals: Map<string, number>;
  filtered: Map<string, number>;
}

/** Counts the puzzles of every trainable theme once the bank is ready (`null` while counting). */
export function useThemeCounts(ready: boolean, difficulty: ThemeDifficulty, userRating: number): ThemeCounts | null {
  const { data } = useServices();
  const key = `${ready}|${difficulty}|${userRating}`;
  const [state, setState] = useState<{ key: string; counts: ThemeCounts } | null>(null);
  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    const repo = data.repos.puzzles;
    const count = (filter: boolean) =>
      Promise.all(
        TRAINABLE_THEMES.map(async (t) => {
          const n = filter
            ? await countThemePuzzles(repo, { theme: t.id, difficulty, userRating })
            : await repo.count({ themes: [t.id] });
          return [t.id, n] as const;
        }),
      ).then((entries) => new Map(entries));
    Promise.all([count(false), count(true)]).then(
      ([totals, filtered]) => alive && setState({ key, counts: { totals, filtered } }),
      (e: unknown) => console.warn('Theme counts failed', e),
    );
    return () => {
      alive = false;
    };
  }, [data, ready, difficulty, userRating, key]);
  return state?.key === key ? state.counts : null;
}

/** Lichess opening tags that occur in the puzzles of a theme (empty while loading or without data). */
export function useOpeningTags(ready: boolean, theme: string): string[] {
  const { data } = useServices();
  const [state, setState] = useState<{ theme: string; tags: string[] }>({ theme: '', tags: [] });
  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    openingTagsForTheme(data.repos.puzzles, theme).then(
      (tags) => alive && setState({ theme, tags }),
      (e: unknown) => console.warn('Opening tags failed', e),
    );
    return () => {
      alive = false;
    };
  }, [data, ready, theme]);
  return state.theme === theme ? state.tags : [];
}

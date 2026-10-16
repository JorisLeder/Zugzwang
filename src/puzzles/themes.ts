/**
 * Theme helpers for Themen-Training and the motif tags after a puzzle (PRD P0-06, DESIGN §3.6).
 */
import type { ThemeStat } from '@/core/profile';
import { PUZZLE_THEMES, type Puzzle, type PuzzleTheme } from '@/core/puzzles';

/** Themes offered in Themen-Training, in display order. */
export const TRAINABLE_THEMES: readonly PuzzleTheme[] = PUZZLE_THEMES.filter((t) => t.trainable);

/** A theme needs this many puzzles in the local bank to be listed once the full bank exists (WP-10 AC 2). */
export const THEME_MIN_PUZZLES = 10;

/** Themen-Training always lists at least this many motifs (P0-06). */
export const MIN_LISTED_THEMES = 20;

/** One row of the theme list. */
export interface ThemeListEntry {
  theme: PuzzleTheme;
  /** Puzzles available (with the current difficulty filter). */
  count: number;
  /** Can be opened (count > 0). */
  available: boolean;
}

/**
 * Themes shown in Themen-Training. When at least `MIN_LISTED_THEMES` trainable themes have `THEME_MIN_PUZZLES`
 * puzzles (full bank, WP-10), only those are listed; otherwise (small seed bank) every trainable theme is listed and
 * themes without puzzles are shown as not available – so the learner always sees ≥ 20 motifs.
 * `totals` = puzzles per theme without difficulty filter, `counts` = with the filter.
 */
export function listTrainingThemes(totals: ReadonlyMap<string, number>, counts: ReadonlyMap<string, number> = totals): ThemeListEntry[] {
  const full = TRAINABLE_THEMES.filter((t) => (totals.get(t.id) ?? 0) >= THEME_MIN_PUZZLES);
  const shown = full.length >= MIN_LISTED_THEMES ? full : TRAINABLE_THEMES;
  return shown.map((theme) => {
    const count = counts.get(theme.id) ?? 0;
    return { theme, count, available: count > 0 };
  });
}

/** Success rate in percent (0–100) of a theme, `null` without attempts. */
export function themeSuccessRate(stat: ThemeStat | undefined): number | null {
  if (!stat || stat.attempts === 0) return null;
  return (stat.successes / stat.attempts) * 100;
}

/** German motif tags of a puzzle (all non-meta themes, in display order). */
export function motifTags(puzzle: Pick<Puzzle, 'themes'>): PuzzleTheme[] {
  return PUZZLE_THEMES.filter((t) => t.group !== 'meta' && puzzle.themes.includes(t.id));
}

/** Display name of a Lichess opening tag: `Sicilian_Defense_Najdorf_Variation` → "Sicilian Defense Najdorf Variation". */
export function openingLabel(tag: string): string {
  return tag.replace(/_/g, ' ').trim();
}


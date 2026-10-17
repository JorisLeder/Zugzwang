/**
 * Success per puzzle theme (PRD Fortschritt §5 "Erfolgsquote je Puzzle-Thema"). Input: `theme_stats` rows (first-try
 * results of rated, learning and theme modes, D-11). Only trainable, non-meta themes are reported – meta tags like
 * "Kurz" or "Vorteil" describe the puzzle, not a skill.
 */
import type { ThemeStat } from '@/core/profile';
import { PUZZLE_THEMES, type PuzzleTheme, type PuzzleThemeId } from '@/core/puzzles';

/** Minimum attempts before a theme counts as weak (dashboard "Als Nächstes trainieren"). */
export const WEAK_THEME_MIN_ATTEMPTS = 5;

/** A theme below this success rate (percent) with enough attempts is weak. */
export const WEAK_THEME_MAX_RATE = 60;

/** Success of one theme. */
export interface ThemeSuccess {
  theme: PuzzleTheme;
  attempts: number;
  successes: number;
  /** Success rate in percent, 0–100. */
  rate: number;
}

const THEME_BY_ID = new Map<PuzzleThemeId, PuzzleTheme>(PUZZLE_THEMES.map((t) => [t.id, t]));

/** Whether a theme id is a skill that can be trained (known, trainable, not a meta tag). */
export function isSkillTheme(id: PuzzleThemeId): boolean {
  const t = THEME_BY_ID.get(id);
  return !!t && t.trainable && t.group !== 'meta';
}

/**
 * Success per theme for all skill themes with at least `minAttempts` attempts (default 1), sorted by attempts (most
 * first), then by display order. Rows of the same theme are merged; broken rows (negative or inconsistent counts) are
 * clamped.
 */
export function themeSuccess(stats: readonly ThemeStat[], opts: { minAttempts?: number } = {}): ThemeSuccess[] {
  const minAttempts = Math.max(1, opts.minAttempts ?? 1);
  const merged = new Map<PuzzleThemeId, { attempts: number; successes: number }>();
  for (const s of stats) {
    if (!isSkillTheme(s.theme)) continue;
    const attempts = Math.max(0, Math.floor(s.attempts));
    const successes = Math.min(attempts, Math.max(0, Math.floor(s.successes)));
    const m = merged.get(s.theme) ?? { attempts: 0, successes: 0 };
    m.attempts += attempts;
    m.successes += successes;
    merged.set(s.theme, m);
  }
  const order = new Map(PUZZLE_THEMES.map((t, i) => [t.id, i]));
  return [...merged.entries()]
    .filter(([, m]) => m.attempts >= minAttempts)
    .map(([id, m]) => ({ theme: THEME_BY_ID.get(id)!, attempts: m.attempts, successes: m.successes, rate: (m.successes / m.attempts) * 100 }))
    .sort((a, b) => b.attempts - a.attempts || (order.get(a.theme.id) ?? 0) - (order.get(b.theme.id) ?? 0));
}

/**
 * Weak themes: at least `WEAK_THEME_MIN_ATTEMPTS` attempts and a success rate below `WEAK_THEME_MAX_RATE` %,
 * weakest first (lowest rate; on a tie the theme with more attempts).
 */
export function weakThemes(
  stats: readonly ThemeStat[],
  opts: { minAttempts?: number; maxRate?: number } = {},
): ThemeSuccess[] {
  const maxRate = opts.maxRate ?? WEAK_THEME_MAX_RATE;
  return themeSuccess(stats, { minAttempts: opts.minAttempts ?? WEAK_THEME_MIN_ATTEMPTS })
    .filter((t) => t.rate < maxRate)
    .sort((a, b) => a.rate - b.rate || b.attempts - a.attempts);
}

/** The weakest theme (see `weakThemes`), `null` when no theme is weak. */
export function weakestTheme(stats: readonly ThemeStat[]): ThemeSuccess | null {
  return weakThemes(stats)[0] ?? null;
}

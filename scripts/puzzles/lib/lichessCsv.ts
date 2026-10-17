/**
 * Row-level handling of the official Lichess puzzle CSV (CC0, https://database.lichess.org/#puzzles) for
 * `npm run puzzles:import-lichess` (BACKLOG WP-03, D-24).
 *
 * Exact columns: `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags`.
 * The Lichess format is our runtime format: `FEN` is the position before the opponent's move, `Moves` starts with that
 * move and ends with a solver move (UCI, space separated).
 *
 * A row goes through three steps, cheapest first:
 * 1. `parseLichessFields` – column count and field shapes (numbers, UCI tokens) → `bad` on malformed data,
 * 2. `filterReason` – popularity, number of plays and rating range of the import options → `filtered`,
 * 3. `lichessRowToPuzzle` – chess legality via `@/lib/chess` (strict FEN check, every move legal in sequence, no game
 *    end before the last move, mate themes consistent with the line) → `bad` on illegal rows.
 * Themes that `PUZZLE_THEMES` does not know are dropped (and counted), so the result passes `scripts/validate/puzzles.ts`.
 */
import type { Puzzle, PuzzleThemeId } from '@/core/puzzles';
import { puzzleThemeById } from '@/core/puzzles';
import { toRow } from '@/core/tables';
import { ChessGame, isUci, validateFen } from '@/lib/chess';

/** Header of the Lichess CSV, in order. */
export const LICHESS_COLUMNS = [
  'PuzzleId',
  'FEN',
  'Moves',
  'Rating',
  'RatingDeviation',
  'Popularity',
  'NbPlays',
  'Themes',
  'GameUrl',
  'OpeningTags',
] as const;

/** Import filters (CLI flags `--min-popularity`, `--min-plays`, `--max`, `--rating-min`, `--rating-max`). */
export interface LichessFilterOptions {
  /** Minimum Lichess popularity (−100 … 100). */
  minPopularity: number;
  /** Minimum number of plays. */
  minPlays: number;
  /** Inclusive rating range. */
  ratingMin: number;
  ratingMax: number;
}

/** Defaults of the CLI (BACKLOG WP-03). */
export const DEFAULT_LICHESS_FILTERS: LichessFilterOptions = { minPopularity: 80, minPlays: 300, ratingMin: 0, ratingMax: 3500 };

/** One row with typed fields (not yet checked for chess legality). */
export interface LichessRow {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string[];
  gameUrl: string;
  openingTags: string[];
}

/** Why a row was rejected as malformed or illegal. */
export type BadRowReason =
  | 'csv'
  | 'columns'
  | 'id'
  | 'fen'
  | 'moves'
  | 'odd-moves'
  | 'illegal-move'
  | 'game-over-early'
  | 'rating'
  | 'rating-deviation'
  | 'popularity'
  | 'plays'
  | 'mate-theme'
  | 'duplicate';

/** Why a well-formed row was left out by the filters. */
export type FilterReason = 'popularity' | 'plays' | 'rating';

const INT = /^-?\d+$/;
const NUM = /^-?\d+(\.\d+)?$/;
const MATE_IN = /^mateIn([1-5])$/;

function words(field: string): string[] {
  return field.trim().split(/\s+/).filter(Boolean);
}

/** `true` if `fields` is exactly the Lichess header. */
export function isLichessHeader(fields: readonly string[]): boolean {
  return fields.length === LICHESS_COLUMNS.length && LICHESS_COLUMNS.every((c, i) => fields[i]?.trim() === c);
}

/** Step 1: column count and field shapes. */
export function parseLichessFields(fields: readonly string[]): { ok: true; row: LichessRow } | { ok: false; reason: BadRowReason } {
  if (fields.length !== LICHESS_COLUMNS.length) return { ok: false, reason: 'columns' };
  const [id, fen, moves, rating, rd, popularity, plays, themes, gameUrl, openingTags] = fields.map((f) => f.trim()) as [
    string, string, string, string, string, string, string, string, string, string,
  ];
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, reason: 'id' };
  if (fen.split(' ').length !== 6) return { ok: false, reason: 'fen' };
  const moveList = words(moves).map((m) => m.toLowerCase());
  if (moveList.length < 2 || !moveList.every((m) => isUci(m))) return { ok: false, reason: 'moves' };
  if (!INT.test(rating) || Number(rating) < 0 || Number(rating) > 4000) return { ok: false, reason: 'rating' };
  if (!NUM.test(rd) || Number(rd) < 0) return { ok: false, reason: 'rating-deviation' };
  if (!INT.test(popularity) || Math.abs(Number(popularity)) > 100) return { ok: false, reason: 'popularity' };
  if (!INT.test(plays) || Number(plays) < 0) return { ok: false, reason: 'plays' };
  return {
    ok: true,
    row: {
      id,
      fen,
      moves: moveList,
      rating: Number(rating),
      ratingDeviation: Number(rd),
      popularity: Number(popularity),
      nbPlays: Number(plays),
      themes: words(themes),
      gameUrl,
      openingTags: words(openingTags),
    },
  };
}

/** Step 2: the import filters; `null` = keep. */
export function filterReason(row: LichessRow, f: LichessFilterOptions): FilterReason | null {
  if (row.popularity < f.minPopularity) return 'popularity';
  if (row.nbPlays < f.minPlays) return 'plays';
  if (row.rating < f.ratingMin || row.rating > f.ratingMax) return 'rating';
  return null;
}

function validUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Step 3: chess legality and conversion to a `Puzzle` (source `lichess`, no stored explanation – the app falls back
 * to the rule-based explanation). Unknown themes are dropped and returned in `unknownThemes`.
 */
export function lichessRowToPuzzle(
  row: LichessRow,
): { ok: true; puzzle: Puzzle; unknownThemes: string[] } | { ok: false; reason: BadRowReason } {
  if (!validateFen(row.fen).ok) return { ok: false, reason: 'fen' };
  if (row.moves.length % 2 !== 0) return { ok: false, reason: 'odd-moves' };
  let game: ChessGame;
  try {
    game = ChessGame.fromFen(row.fen);
  } catch {
    return { ok: false, reason: 'fen' };
  }
  let lastIsMate = false;
  for (let i = 0; i < row.moves.length; i++) {
    if (game.status().isOver) return { ok: false, reason: 'game-over-early' };
    const r = game.move(row.moves[i]!);
    if (!r) return { ok: false, reason: 'illegal-move' };
    lastIsMate = r.isCheckmate;
  }
  const themes: PuzzleThemeId[] = [];
  const unknownThemes: string[] = [];
  for (const t of row.themes) {
    if (puzzleThemeById(t)) {
      if (!themes.includes(t)) themes.push(t);
    } else unknownThemes.push(t);
  }
  const userMoves = row.moves.length / 2;
  const mateThemes = themes.map((t) => MATE_IN.exec(t)).filter((m): m is RegExpExecArray => m !== null);
  if ((mateThemes.length > 0 || themes.includes('mate')) && !lastIsMate) return { ok: false, reason: 'mate-theme' };
  if (mateThemes.length > 1) return { ok: false, reason: 'mate-theme' };
  for (const m of mateThemes) {
    const n = Number(m[1]);
    if (n < 5 ? userMoves !== n : userMoves < 5) return { ok: false, reason: 'mate-theme' };
  }
  const puzzle: Puzzle = {
    id: row.id,
    fen: row.fen,
    moves: row.moves,
    rating: row.rating,
    ratingDeviation: row.ratingDeviation,
    themes,
    openingTags: row.openingTags,
    popularity: row.popularity,
    nbPlays: row.nbPlays,
    source: 'lichess',
  };
  if (validUrl(row.gameUrl)) puzzle.gameUrl = row.gameUrl;
  return { ok: true, puzzle, unknownThemes };
}

/** Columns of the Supabase seed CSV = the `puzzles` table (`PuzzleRow`, `@/core/tables`). */
export const SEED_CSV_COLUMNS = [
  'id',
  'fen',
  'moves',
  'rating',
  'rating_deviation',
  'themes',
  'opening_tags',
  'popularity',
  'nb_plays',
  'source',
  'explanation',
  'game_url',
] as const;

/** Quotes a CSV field when needed (RFC 4180). `null` becomes an unquoted empty field (= SQL NULL in `COPY … CSV`). */
export function csvField(value: string | null): string {
  if (value === null) return '';
  if (value === '' || /[",\r\n{}]/.test(value) || value !== value.trim()) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Postgres array literal: `{e2e4,e7e5}`; elements with special characters are double-quoted. */
export function pgArray(items: readonly string[]): string {
  return `{${items.map((s) => (/^[A-Za-z0-9_.:+=-]+$/.test(s) ? s : `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)).join(',')}}`;
}

/** Header line of the seed CSV (with trailing newline). */
export function seedCsvHeader(): string {
  return `${SEED_CSV_COLUMNS.join(',')}\n`;
}

/** One seed CSV line for `COPY puzzles (…) FROM … WITH (FORMAT csv, HEADER true)` (with trailing newline). */
export function seedCsvLine(p: Puzzle): string {
  const r = toRow.puzzle(p);
  const cells: Array<string | null> = [
    r.id,
    r.fen,
    pgArray(r.moves),
    String(r.rating),
    String(r.rating_deviation),
    pgArray(r.themes),
    pgArray(r.opening_tags),
    r.popularity === null ? null : String(r.popularity),
    r.nb_plays === null ? null : String(r.nb_plays),
    r.source,
    r.explanation === null ? null : JSON.stringify(r.explanation),
    r.game_url,
  ];
  return `${cells.map(csvField).join(',')}\n`;
}

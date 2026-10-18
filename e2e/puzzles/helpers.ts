/**
 * Helpers for the puzzle e2e tests (WP-03): the bank (every chunk of the manifest), the seed chunk and the demo
 * puzzles read from the repository, positions along
 * a puzzle line (via the rules layer) and board/panel waits. Generic board helpers: `e2e/support/board.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import type { Puzzle } from '../../src/core/puzzles';
import { ChessGame } from '../../src/lib/chess';
import { board, clickMove, square } from '../support/board';

const root = join(import.meta.dirname, '..', '..');

/** The wave-1 seed bank (`public/data/puzzles/seed.json`). */
export const SEED: Puzzle[] = JSON.parse(readFileSync(join(root, 'public/data/puzzles/seed.json'), 'utf8')) as Puzzle[];

/** The whole local bank: every chunk listed in `public/data/puzzles/manifest.json` (seed, lessons, generated). */
export const BANK: Puzzle[] = (
  JSON.parse(readFileSync(join(root, 'public/data/puzzles/manifest.json'), 'utf8')) as { chunks: Array<{ file: string }> }
).chunks.flatMap((c) => JSON.parse(readFileSync(join(root, 'public/data/puzzles', c.file), 'utf8')) as Puzzle[]);

/** The 5 demo puzzles (`src/puzzles/demoPuzzles.json`). */
export const DEMO: Puzzle[] = JSON.parse(readFileSync(join(root, 'src/puzzles/demoPuzzles.json'), 'utf8')) as Puzzle[];

/** A seed puzzle by id. */
export function seed(id: string): Puzzle {
  const p = SEED.find((x) => x.id === id);
  if (!p) throw new Error(`seed puzzle ${id} not found`);
  return p;
}

/** FEN after the first `ply` moves of the puzzle line (ply 1 = task position). */
export function fenAt(p: Puzzle, ply: number): string {
  return ChessGame.fromMoves(p.fen, p.moves.slice(0, ply)).fen();
}

/** Legal moves of the task position (UCI) that mate immediately. */
export function matingMoves(p: Puzzle, ply = 1): string[] {
  const fen = fenAt(p, ply);
  return ChessGame.fromFen(fen)
    .legalMoves()
    .map((m) => m.uci)
    .filter((uci) => ChessGame.fromFen(fen).move(uci)?.isCheckmate);
}

/** A legal move at `ply` that is neither the solution nor a mate (a wrong answer). */
export function wrongMove(p: Puzzle, ply = 1): string {
  const fen = fenAt(p, ply);
  const solution = p.moves[ply]!;
  const m = ChessGame.fromFen(fen)
    .legalMoves()
    .map((x) => x.uci)
    .find((uci) => uci !== solution && !ChessGame.fromFen(fen).move(uci)?.isCheckmate);
  if (!m) throw new Error(`no wrong move in ${p.id}`);
  return m;
}

/** Plays a UCI move on the board (click/tap origin and target, promotion if needed). */
export async function playUci(page: Page, uci: string): Promise<void> {
  await clickMove(page, uci.slice(0, 2), uci.slice(2, 4), (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined);
}

/** The puzzle panel (`data-phase`, `data-puzzle-id`). */
export function panel(page: Page) {
  return page.getByTestId('puzzle-panel');
}

/** Id of the puzzle on screen once the learner is to move. */
export async function currentPuzzle(page: Page, pool: Puzzle[] = BANK): Promise<Puzzle> {
  await expect(panel(page)).toHaveAttribute('data-phase', 'user', { timeout: 10_000 });
  const id = await panel(page).getAttribute('data-puzzle-id');
  const p = pool.find((x) => x.id === id);
  if (!p) throw new Error(`puzzle ${id} is not in the pool`);
  return p;
}

/** Waits until the board shows the position after `ply` line moves and the learner (or nobody, at the end) is to move. */
export async function waitForPly(page: Page, p: Puzzle, ply: number): Promise<void> {
  await expect(board(page)).toHaveAttribute('data-fen', fenAt(p, ply), { timeout: 10_000 });
  await expect(panel(page)).toHaveAttribute('data-phase', ply >= p.moves.length ? 'done' : 'user', { timeout: 10_000 });
}

/** Plays the learner's moves of the whole solution, waiting for each opponent reply. */
export async function solve(page: Page, p: Puzzle): Promise<void> {
  for (let ply = 1; ply < p.moves.length; ply += 2) {
    await waitForPly(page, p, ply);
    await playUci(page, p.moves[ply]!);
  }
  await expect(panel(page)).toHaveAttribute('data-phase', 'done', { timeout: 10_000 });
}

/** Highlight tokens of a square (`data-highlights` on the inner square element). */
export async function highlights(page: Page, sq: string): Promise<string[]> {
  const value = await square(page, sq).locator('[role="button"]').first().getAttribute('data-highlights');
  return (value ?? '').split(' ').filter(Boolean);
}

/**
 * Opens a puzzle mode through the app's own links (sidebar "Puzzles" on desktop, "‹ Zurück" on phones, then the mode
 * card of the hub): client-side navigation keeps the in-memory wave-1 data layer (D-50) and the loaded route modules.
 */
export async function openMode(page: Page, mode: 'Bewertete Puzzles' | 'Lernmodus' | 'Themen-Training'): Promise<void> {
  await page.locator('a[href="/puzzles"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/puzzles$/);
  await page.getByRole('link', { name: new RegExp(mode) }).click();
}

/** Answers the self-assessment of the rated mode (default: Einsteiger, start rating 600). */
export async function chooseSelfAssessment(page: Page, label: RegExp = /Einsteiger/): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Wie gut spielst du schon?' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('radio', { name: label }).click();
  await page.getByRole('button', { name: 'Los geht’s' }).click();
}

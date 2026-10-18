/**
 * Helpers for the four core journeys (PRD "Kern-Abläufe", WP-12): main navigation, a lesson walker that solves every
 * step from the lesson JSON in `content/lessons/`, and a bot-game player whose moves come from a Node Stockfish in
 * the test process (`src/lib/uci/node`). Chess facts only via the rules layer (`src/lib/chess`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import type { Color, Fen, Uci } from '../../src/core/chess';
import type { EngineService } from '../../src/core/engine';
import type { Lesson, LessonStep, MoveTreeNode } from '../../src/core/lessons';
import { ChessGame } from '../../src/lib/chess';
import { createNodeEngineService } from '../../src/lib/uci/node';
import { board, readFen } from '../support/board';
import { playUci } from '../puzzles/helpers';

const root = join(import.meta.dirname, '..', '..');

/** The visible instance of an element that may exist twice (phone vs desktop layout). */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/** Main navigation entries (sidebar from 1280 px). */
export type NavArea = 'Start' | 'Puzzles' | 'Spielen' | 'Lernen' | 'Analyse' | 'Profil';

/** Opens an area through the main navigation (client-side navigation, like a user). */
export async function nav(page: Page, area: NavArea): Promise<void> {
  await visible(page.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('link', { name: area, exact: true }).click();
}

/** Waits for the start page (dashboard). */
export async function expectDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
}

// --- lessons -------------------------------------------------------------------------------------------------------

/** A lesson of the real content (`content/lessons/<courseId>/<lessonId>.json`). */
export function lessonContent(courseId: string, lessonId: string): Lesson {
  return JSON.parse(readFileSync(join(root, 'content/lessons', courseId, `${lessonId}.json`), 'utf8')) as Lesson;
}

/** The lesson player region. */
export function player(page: Page): Locator {
  return visible(page.getByTestId('lesson-player'));
}

/** Waits until the player shows step `index` with the type of `step`. */
export async function expectStep(page: Page, step: LessonStep, index: number): Promise<void> {
  await expect(player(page)).toHaveAttribute('data-step-index', String(index), { timeout: 10_000 });
  await expect(visible(page.getByTestId('lesson-step'))).toHaveAttribute('data-step-type', step.type);
}

/** "Weiter" in the lesson action bar. */
export function nextButton(page: Page): Locator {
  return page.getByTestId('lesson-next');
}

/** The board shows `fen` (piece placement, side to move, castling and en passant – the counters may differ). */
async function expectBoardAt(page: Page, fen: Fen): Promise<void> {
  const key = fen.split(' ').slice(0, 4).join(' ');
  await expect.poll(async () => (await readFen(page)).split(' ').slice(0, 4).join(' '), { timeout: 10_000 }).toBe(key);
}

/** Plays the main line of a "Finde den Zug" tree: user move, auto-played reply, next user move … */
async function playMoveTree(page: Page, fen: Fen, solution: MoveTreeNode[]): Promise<void> {
  const moves: Uci[] = [];
  let node: MoveTreeNode | undefined = solution[0];
  while (node) {
    await expectBoardAt(page, ChessGame.fromMoves(fen, moves).fen());
    await playUci(page, node.move);
    moves.push(node.move);
    const reply: MoveTreeNode | undefined = node.children[0];
    if (!reply) break;
    moves.push(reply.move);
    node = reply.children[0];
  }
}

/**
 * Solves the steps `from` … `to - 1` of a lesson without mistakes (Erklärung/Demo: "Weiter"; Quiz: the correct
 * option; Finde den Zug: the main line of the solution tree), each followed by "Weiter". "Ausspielen" steps need a
 * real game and are not supported here.
 */
export async function walkLesson(page: Page, lesson: Lesson, from = 0, to = lesson.steps.length): Promise<void> {
  for (let i = from; i < to; i++) {
    const step = lesson.steps[i]!;
    await expectStep(page, step, i);
    switch (step.type) {
      case 'explanation':
      case 'demo':
        break;
      case 'quiz': {
        const correct = step.options.find((o) => o.correct)!;
        await visible(page.getByRole('button', { name: correct.textDe, exact: true })).click();
        await expect(visible(page.getByTestId('quiz-feedback'))).toBeVisible();
        break;
      }
      case 'find_move':
        await playMoveTree(page, step.fen, step.solution);
        await expect(visible(page.getByTestId('lesson-step'))).toHaveAttribute('data-phase', 'done');
        break;
      case 'play_out':
        throw new Error(`walkLesson: step ${step.id} is a play-out step`);
    }
    await expect(nextButton(page)).toBeEnabled();
    await nextButton(page).click();
  }
}

/** A legal move of a "Finde den Zug" step that is not accepted (not in the tree, no mate when any mate counts). */
export function wrongFindMove(step: Extract<LessonStep, { type: 'find_move' }>): Uci {
  const accepted = new Set(step.solution.map((n) => n.move));
  const m = ChessGame.fromFen(step.fen)
    .legalMoves()
    .find((x) => !accepted.has(x.uci) && !(step.acceptAnyMate && ChessGame.fromFen(step.fen).move(x.uci)?.isCheckmate));
  if (!m) throw new Error(`no wrong move in step ${step.id}`);
  return m.uci;
}

// --- bot games -----------------------------------------------------------------------------------------------------

/** The result dialog of a finished game. */
export function resultDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /^(Gewonnen|Verloren|Remis)$/ });
}

const turnOf = (fen: Fen): Color => fen.split(' ')[1] as Color;

/**
 * A move of the side to move that hangs a knight or bishop to a pawn (quiet move to a square a pawn can take on):
 * the deliberate mistake that the game review must find. `null` when there is none.
 */
export function hangingMove(fen: Fen): Uci | null {
  const game = ChessGame.fromFen(fen);
  for (const m of game.legalMoves()) {
    if (m.isCapture || (m.piece !== 'n' && m.piece !== 'b')) continue;
    const after = ChessGame.fromFen(fen);
    after.move(m.uci);
    if (after.legalMoves().some((r) => r.piece === 'p' && r.to === m.to)) return m.uci;
  }
  return null;
}

/** Node Stockfish for the learner's moves. */
export async function createMoveEngine(): Promise<EngineService> {
  const engine = createNodeEngineService();
  await engine.init();
  return engine;
}

/** Options of `playGameToEnd`. */
export interface PlayOptions {
  userColor: Color;
  engine: EngineService;
  /** The learner's move number (1-based) at which a knight or bishop is hung on purpose. */
  blunderAtMove?: number;
  /** Learner moves before giving up and resigning (the game still ends). */
  maxMoves?: number;
}

/**
 * Plays the learner's side until the game is over (result dialog): engine moves, with an optional deliberate mistake.
 * Returns the UCI moves the learner played.
 */
export async function playGameToEnd(page: Page, opts: PlayOptions): Promise<Uci[]> {
  const played: Uci[] = [];
  const max = opts.maxMoves ?? 120;
  const result = resultDialog(page);
  while (played.length < max) {
    // Wait until it is the learner's turn or the game is over.
    await expect
      .poll(async () => (await result.isVisible()) || turnOf(await readFen(page)) === opts.userColor, { timeout: 20_000 })
      .toBe(true);
    if (await result.isVisible()) return played;
    await expect(page.getByTestId('game-status')).toHaveText(/Du bist am Zug|Schach! Dein König/, { timeout: 20_000 });
    const fen = await readFen(page);
    let uci: Uci | null = null;
    if (opts.blunderAtMove === played.length + 1) uci = hangingMove(fen);
    if (!uci) uci = (await opts.engine.bestMove(fen, { depth: 10 })).move;
    if (!uci) throw new Error(`engine found no move in ${fen}`);
    await playUci(page, uci);
    played.push(uci);
    await expect(board(page)).not.toHaveAttribute('data-fen', fen, { timeout: 10_000 });
  }
  // Safety net: a game that does not end within `max` moves is resigned.
  await visible(page.getByRole('button', { name: 'Aufgeben' })).click();
  await page.getByRole('dialog', { name: 'Partie wirklich aufgeben?' }).getByRole('button', { name: 'Aufgeben' }).click();
  await expect(result).toBeVisible();
  return played;
}

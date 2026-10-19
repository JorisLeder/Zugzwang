/**
 * PRD timings measured in the real app (production build, local mode) through Playwright over CDP – part of
 * `npm run lighthouse`:
 * - Puzzle switch ≤ 300 ms: solve rated puzzles and press "Nächstes Puzzle"; the app records the time from the click
 *   to the next puzzle on the board (`performance.measure('zz-puzzle-switch')`). Measured with 4× CPU slowdown (the
 *   Lighthouse mobile CPU); the budget applies to the median, the maximum is reported.
 * - Bot answer ≤ 1 s without artificial think time: games against bots of every move model; the app records the time
 *   from the request to the chosen move (`performance.measure('zz-bot-answer')`, think time excluded). The engine runs
 *   in a worker with a fixed time budget per move, so the CPU slowdown would not change it. The first answer of the
 *   session may include the engine start (worker + WASM) and is reported separately (`detail`); the budget applies
 *   to the answers of the running engine.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import type { Puzzle } from '../../src/core/puzzles';
import { ChessGame } from '../../src/lib/chess';

/** One measured timing. */
export interface TimingResult {
  name: string;
  /** The value checked against the budget. */
  valueMs: number;
  budgetMs: number;
  samplesMs: number[];
  detail: string;
}

const ROOT = join(import.meta.dirname, '..', '..');
const PUZZLE_SWITCHES = 8;
/** Bots of the three move models: skill level, human-like MultiPV choice, UCI_Elo (strongest search). */
const BOTS = [/^Kalle, 700 Elo/, /^Henrike, 2000 Elo/, /^Zora, 2500 Elo/];
const BOT_MOVES_PER_GAME = 4;
/** Quiet user moves that leave the opening repertoire quickly (the bot then has to search). */
const USER_MOVES = ['a2a3', 'h2h3', 'b2b3', 'g2g3', 'a3a4', 'h3h4', 'c2c3', 'f2f3'];

function bank(): Puzzle[] {
  const dir = join(ROOT, 'public', 'data', 'puzzles');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { chunks: Array<{ file: string }> };
  return manifest.chunks.flatMap((c) => JSON.parse(readFileSync(join(dir, c.file), 'utf8')) as Puzzle[]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(what: string, check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(25);
  }
  throw new Error(`Timeout: ${what}`);
}

const board = (page: Page) => page.getByTestId('board').first();
const attr = (page: Page, testId: string, name: string) => page.getByTestId(testId).first().getAttribute(name);

async function playUci(page: Page, uci: string): Promise<void> {
  for (const sq of [uci.slice(0, 2), uci.slice(2, 4)]) await board(page).locator(`[data-square="${sq}"]`).click();
  if (uci[4]) await page.getByTestId(`promotion-${uci[4]}`).click();
}

async function measures(page: Page, name: string): Promise<number[]> {
  return page.evaluate((n) => performance.getEntriesByName(n, 'measure').map((m) => m.duration), name);
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
const round = (xs: number[]) => xs.map((x) => Math.round(x));

async function puzzleSwitch(page: Page, base: string): Promise<TimingResult> {
  const puzzles = new Map(bank().map((p) => [p.id, p]));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(base + paths.puzzlesRated());
  const samples: number[] = [];
  for (let i = 0; i < PUZZLE_SWITCHES; i++) {
    await until('puzzle ready', async () => (await attr(page, 'puzzle-panel', 'data-phase')) === 'user', 30_000);
    const id = (await attr(page, 'puzzle-panel', 'data-puzzle-id'))!;
    const p = puzzles.get(id);
    if (!p) throw new Error(`Puzzle ${id} is not in the bank`);
    for (let ply = 1; ply < p.moves.length; ply += 2) {
      const fen = ChessGame.fromMoves(p.fen, p.moves.slice(0, ply)).fen();
      await until(`ply ${ply} of ${id}`, async () => (await board(page).getAttribute('data-fen')) === fen && (await attr(page, 'puzzle-panel', 'data-phase')) === 'user');
      await playUci(page, p.moves[ply]!);
    }
    await until(`${id} solved`, async () => (await attr(page, 'puzzle-panel', 'data-phase')) === 'done');
    const next = page.getByTestId('next-puzzle');
    await until('next enabled', () => next.isEnabled());
    const before = (await measures(page, 'zz-puzzle-switch')).length;
    await next.click();
    await until('next puzzle shown', async () => (await attr(page, 'puzzle-panel', 'data-puzzle-id')) !== id);
    await until('switch measured', async () => (await measures(page, 'zz-puzzle-switch')).length > before);
    samples.push((await measures(page, 'zz-puzzle-switch')).at(-1)!);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  return {
    name: 'Puzzle-Wechsel (4× CPU)',
    valueMs: Math.round(median(samples)),
    budgetMs: 300,
    samplesMs: round(samples),
    detail: `median of ${samples.length}, max ${Math.round(Math.max(...samples))} ms`,
  };
}

async function botGame(page: Page, base: string, bot: RegExp, first: boolean): Promise<number[]> {
  // The first game loads the app; later ones navigate inside it, so the engine worker keeps running.
  if (first) await page.goto(base + paths.play());
  else await page.locator(`a[href="${paths.play()}"]`).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: bot }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Wettkampf' }).click();
  await dialog.getByRole('radio', { name: 'Weiß' }).click();
  await dialog.getByRole('button', { name: 'Partie starten' }).click();
  const status = page.getByTestId('game-status');
  const userTurn = async () => /Du bist am Zug|Schach! Dein König/.test((await status.textContent()) ?? '');
  await until('game started', userTurn);
  const start = (await measures(page, 'zz-bot-answer')).length;
  for (let n = 0; n < BOT_MOVES_PER_GAME; n++) {
    const game = ChessGame.fromFen((await board(page).getAttribute('data-fen'))!);
    if (game.status().isOver) break;
    const legal = new Set(game.legalMoves().map((m) => m.uci));
    const uci = USER_MOVES.find((m) => legal.has(m)) ?? [...legal][0]!;
    const before = (await measures(page, 'zz-bot-answer')).length;
    await playUci(page, uci);
    await until('bot answered', async () => (await measures(page, 'zz-bot-answer')).length > before, 30_000);
    // Wait for the bot's move on the board (after its artificial think time) before the next own move.
    await until('user to move again', userTurn, 30_000);
  }
  return (await measures(page, 'zz-bot-answer')).slice(start);
}

async function botAnswer(page: Page, base: string): Promise<TimingResult> {
  const answers: number[] = [];
  for (const [i, bot] of BOTS.entries()) answers.push(...(await botGame(page, base, bot, i === 0)));
  if (answers.length < 2) throw new Error('Too few bot answers measured');
  const [cold, ...warm] = answers as [number, ...number[]];
  return {
    name: 'Bot-Antwort (ohne Bedenkzeit)',
    valueMs: Math.round(Math.max(...warm)),
    budgetMs: 1000,
    samplesMs: round(warm),
    detail: `max of ${warm.length} answers (${BOTS.length} bots), median ${Math.round(median(warm))} ms; first answer ${Math.round(cold)} ms (engine start unless it was a book move)`,
  };
}

/** Measures the timings in the running Chromium (default context with a completed onboarding). */
export async function measureTimings(port: number, base: string): Promise<TimingResult[]> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try {
    const context = browser.contexts()[0]!;
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const results = [await puzzleSwitch(page, base), await botAnswer(page, base)];
    await page.close();
    return results;
  } finally {
    await browser.close();
  }
}

/**
 * WP-09 e2e – statistics and profile on seeded data (AC3): rating curves (puzzle, bot) with table fallback, success
 * per theme, accuracy per game phase and the most frequent mistakes; profile with name, ratings, daily goal, mode and
 * the account section. Data is written straight into the app's IndexedDB, then the page is reloaded.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { START_FEN } from '../../src/core/chess';
import { expect, test } from '../support/fixtures';
import { completeOnboarding, rating, seed, storedProfile } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString();
}

function attempt(i: number, ratingAfter: number, themes: string[]) {
  return {
    id: `seed-attempt-${i}`,
    puzzleId: `seed-puzzle-${i}`,
    mode: 'rated',
    solved: true,
    firstTry: true,
    hintsUsed: 0,
    solutionShown: false,
    timeMs: 5000,
    themes,
    puzzleRating: 1000,
    ratingBefore: ratingAfter - 10,
    ratingAfter,
    createdAt: iso(10 - i),
  };
}

const GAME_ID = 'seed-game-1';

function analysedMove(ply: number, color: 'w' | 'b', phase: string, accuracy: number, classification: string, motifs: string[] = []) {
  return {
    ply,
    color,
    san: 'e4',
    uci: 'e2e4',
    fenBefore: START_FEN,
    fenAfter: START_FEN,
    evalBefore: { type: 'cp', value: 0 },
    evalAfter: { type: 'cp', value: 0 },
    bestMove: 'e2e4',
    bestMoveSan: 'e4',
    bestLine: [],
    playedLine: [],
    winPctBefore: 50,
    winPctAfter: 50,
    expectedPointsLoss: 0,
    accuracy,
    classification,
    phase,
    facts: motifs.length
      ? { kind: 'mistake', mover: color, fenBefore: START_FEN, bestLine: [], refutation: [], motifs: motifs.map((id) => ({ id, squares: [], pieces: [] })) }
      : undefined,
  };
}

async function seedProgress(page: Page) {
  const moves = [
    analysedMove(1, 'w', 'opening', 90, 'good'),
    analysedMove(2, 'b', 'opening', 10, 'blunder', ['fork']),
    analysedMove(3, 'w', 'opening', 80, 'best'),
    analysedMove(5, 'w', 'middlegame', 30, 'blunder', ['fork', 'hanging_piece']),
    analysedMove(7, 'w', 'middlegame', 50, 'mistake', ['fork']),
    analysedMove(9, 'w', 'endgame', 70, 'inaccuracy'),
  ];
  const counts = { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 };
  await seed(page, {
    ratings: [rating('puzzle', 1040, 5), rating('bot', 1060, 1)],
    puzzleAttempts: [
      attempt(0, 1005, ['fork']),
      attempt(1, 1012, ['fork']),
      attempt(2, 998, ['pin']),
      attempt(3, 1025, ['fork']),
      attempt(4, 1040, ['pin']),
    ],
    themeStats: [
      { theme: 'fork', attempts: 8, successes: 6 },
      { theme: 'pin', attempts: 5, successes: 1 },
    ],
    games: [
      {
        id: GAME_ID,
        source: 'bot',
        externalId: null,
        botId: 'theo',
        userColor: 'w',
        assistance: 'competition',
        timeControl: { kind: 'none' },
        startFen: START_FEN,
        pgn: '',
        headers: { White: 'Du', Black: 'Theo', BlackElo: '1000' },
        status: 'finished',
        result: '1-0',
        endReason: 'resignation',
        origin: { type: 'new' },
        activeDeviceId: null,
        activeHeartbeatAt: null,
        ratingBefore: 1000,
        ratingAfter: 1060,
        createdAt: iso(2),
        updatedAt: iso(1),
        finishedAt: iso(1),
      },
    ],
    gameAnalyses: [
      {
        gameId: GAME_ID,
        engineId: 'seed',
        engineVersion: '1',
        depth: 12,
        createdAt: iso(1),
        accuracy: { w: 64, b: 10 },
        counts: { w: { ...counts }, b: { ...counts } },
        moves,
        keyMoments: [],
        evalGraph: [],
      },
    ],
  });
}

test.describe('statistics (AC3)', () => {
  test('rating curves, theme success, phase accuracy and frequent mistakes from stored data', async ({ page }) => {
    await completeOnboarding(page, 'Clubspieler');
    await page.goto(paths.stats());
    await seedProgress(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Statistik' })).toBeVisible();

    const puzzle = page.getByTestId('stats-rating-puzzle');
    await expect(puzzle).toHaveAttribute('data-count', '5');
    await expect(puzzle).toHaveAttribute('data-current', '1040');
    await expect(puzzle.locator('svg path').first()).toBeVisible();
    await expect(page.getByRole('slider', { name: /Puzzle-Rating: 5 Wertungen, aktuell 1\.040/ })).toBeVisible();
    await puzzle.getByRole('button', { name: 'Als Tabelle anzeigen' }).click();
    await expect(puzzle.getByRole('row')).toHaveCount(6);
    await expect(puzzle.getByRole('table')).toContainText('1.040');

    const bot = page.getByTestId('stats-rating-bot');
    await expect(bot).toHaveAttribute('data-count', '1');
    await expect(bot).toHaveAttribute('data-current', '1060');

    const pin = page.getByTestId('stats-themes-bars').locator('[data-row="pin"]');
    await expect(pin).toHaveAttribute('data-flagged', 'true');
    await expect(pin).toContainText('20 %');
    await expect(page.getByTestId('stats-themes-bars').locator('[data-row="fork"]')).toContainText('75 %');

    const phases = page.getByTestId('stats-phases-bars');
    await expect(phases.locator('[data-row="opening"]')).toHaveAttribute('data-value', '85');
    await expect(phases.locator('[data-row="middlegame"]')).toHaveAttribute('data-value', '40');
    await expect(phases.locator('[data-row="middlegame"]')).toContainText('schwächste Phase');
    await expect(phases.locator('[data-row="endgame"]')).toHaveAttribute('data-value', '70');

    const types = page.getByTestId('stats-mistake-types');
    await expect(types.locator('tr[data-classification="blunder"]')).toHaveAttribute('data-count', '1');
    await expect(types.locator('tr[data-classification="mistake"]')).toHaveAttribute('data-count', '1');
    await expect(types.locator('tr[data-classification="inaccuracy"]')).toHaveAttribute('data-count', '1');
    const motifs = page.getByTestId('stats-motifs').locator('li');
    await expect(motifs.first()).toHaveAttribute('data-motif', 'fork');
    await expect(motifs.first()).toHaveAttribute('data-count', '2');

    // The weak theme leads to its training.
    await pin.getByRole('link', { name: 'Fesselung trainieren' }).click();
    await expect(page).toHaveURL(/\/puzzles\/themes\/pin$/);
  });

  test('empty statistics explain what to do', async ({ page }) => {
    await completeOnboarding(page, 'Einsteiger');
    await page.goto(paths.stats());
    await expect(page.getByTestId('stats-rating-puzzle')).toContainText('Löse bewertete Puzzles');
    await expect(page.getByTestId('stats-themes')).toContainText('Noch keine Puzzle-Versuche.');
    await expect(page.getByTestId('stats-phases')).toContainText('Noch keine analysierten Partien.');
    await expect(page.getByTestId('stats-mistakes')).toContainText('Noch keine Fehler gefunden');
  });
});

test.describe('profile', () => {
  test('name, ratings, daily goal, mode and account section; changes survive a reload', async ({ page }) => {
    await completeOnboarding(page, 'Fortgeschritten', 20);
    await page.goto(paths.profile());
    await expect(page.getByTestId('profile-puzzle-rating')).toContainText('1.500');
    await expect(page.getByTestId('profile-bot-rating')).toContainText('1.600');
    await expect(page.getByTestId('profile-ratings')).toContainText('Fortgeschritten');
    await expect(page.getByTestId('profile-sync')).toHaveAttribute('data-mode', 'local');
    await expect(page.getByTestId('profile-sync')).toContainText('Lokaler Modus');
    await expect(page.getByRole('button', { name: /Daten exportieren/ })).toBeVisible();

    await page.getByLabel('Anzeigename').fill('Mia');
    await page.getByTestId('profile-name').getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByText('Gespeichert.')).toBeVisible();
    await page.getByRole('radiogroup', { name: 'Tagesziel in Minuten' }).getByRole('radio', { name: '30 Min.' }).click();
    await expect.poll(async () => (await storedProfile(page))?.dailyGoalMinutes).toBe(30);

    await page.reload();
    await expect(page.getByLabel('Anzeigename')).toHaveValue('Mia');
    await expect(page.getByRole('radiogroup', { name: 'Tagesziel in Minuten' }).getByRole('radio', { name: '30 Min.' })).toHaveAttribute('aria-checked', 'true');
    await page.goto('/');
    await expect(page.getByText('Hallo Mia! Dein Training auf einen Blick.')).toBeVisible();
    await expect(page.getByTestId('dashboard-daily-goal-value')).toHaveAttribute('data-goal', '30');
  });
});

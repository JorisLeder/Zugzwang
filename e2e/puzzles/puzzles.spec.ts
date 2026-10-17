/**
 * WP-03 e2e: rated puzzles (self-assessment, auto-played opponent move, wrong move, hint = not solved, rating with
 * delta, next puzzle ≤ 300 ms), learning mode (any mate accepted, three hint stages, playable solution, explanation),
 * theme training (≥ 20 motifs, difficulty filter, success rate), demo (5 puzzles, nothing persisted) and offline use
 * after the bank is loaded. Runs on desktop and mobile.
 * Wave 1 (D-50): the data layer is in memory – flows stay inside one page load (client-side navigation only); the
 * reload test is `fixme` until WP-08 is integrated.
 */
import { paths } from '../../src/app/paths';
import { hasHorizontalScroll } from '../support/app';
import { board } from '../support/board';
import { expect, test } from '../support/fixtures';
import {
  chooseSelfAssessment,
  currentPuzzle,
  DEMO,
  fenAt,
  highlights,
  matingMoves,
  openMode,
  panel,
  playUci,
  seed,
  solve,
  waitForPly,
  wrongMove,
} from './helpers';

test.describe('Bewertete Puzzles (P0-04)', () => {
  test('self-assessment, auto-played opponent move, solution, rating with delta, next puzzle ≤ 300 ms', async ({ page }, testInfo) => {
    await page.goto(paths.puzzlesRated());
    await chooseSelfAssessment(page);
    const p = await currentPuzzle(page);
    // The opponent's first move was played automatically: task position with its last-move highlight.
    expect(Math.abs(p.rating - 600)).toBeLessThanOrEqual(150);
    await expect(board(page)).toHaveAttribute('data-fen', fenAt(p, 1));
    expect(await highlights(page, p.moves[0]!.slice(2, 4))).toContain('last-move');
    await expect(page.getByTestId('rating-chip')).toHaveText('Dein Rating 600');
    await expect(page.getByTestId('puzzle-status')).toHaveText(/(Weiß|Schwarz) am Zug\. (Finde den besten Zug|Setze matt in \d (Zug|Zügen))\./);
    await expect(page.getByTestId('puzzle-difficulty')).toHaveCount(0); // puzzle rating hidden until the end
    await solve(page, p);
    await expect(page.getByTestId('puzzle-status')).toHaveText('Gelöst!');
    const result = page.getByTestId('rating-result');
    await expect(result).toContainText(/Puzzle-Rating \d+/);
    await expect(result).toContainText('+');
    await expect(page.getByTestId('puzzle-explanation')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    // "Nächstes Puzzle" → the next puzzle (prefetched) is on the board within 300 ms (performance.measure in the app).
    const next = page.getByTestId('next-puzzle');
    await expect(next).toBeEnabled();
    await next.click();
    await expect(panel(page)).not.toHaveAttribute('data-puzzle-id', p.id);
    const ms = await page.evaluate(() => performance.getEntriesByName('zz-puzzle-switch', 'measure').at(-1)?.duration ?? null);
    expect(ms).not.toBeNull();
    testInfo.annotations.push({ type: 'puzzle-switch-ms', description: String(Math.round(ms!)) });
    if (testInfo.project.name === 'desktop') expect(ms!).toBeLessThanOrEqual(300);
    const q = await currentPuzzle(page);
    expect(q.id).not.toBe(p.id);
  });

  test('a wrong move is marked at once, fails the attempt with a rating delta and is taken back', async ({ page }) => {
    await page.goto(paths.puzzlesRated());
    await chooseSelfAssessment(page);
    const p = await currentPuzzle(page);
    const wrong = wrongMove(p);
    await playUci(page, wrong);
    await expect(page.getByTestId('puzzle-status')).toHaveText(/Leider falsch – das Puzzle zählt als nicht gelöst\./);
    expect(await highlights(page, wrong.slice(2, 4))).toContain('wrong');
    await expect(page.getByTestId('rating-result')).toContainText('−');
    await waitForPly(page, p, 1); // undone after 700 ms, the learner may keep trying
    await solve(page, p);
    await expect(page.getByTestId('puzzle-status')).toHaveText('Zu Ende gelöst – für dein Rating zählt es als nicht gelöst.');
  });

  test('a hint needs a confirmation and counts as not solved (AC 3)', async ({ page }) => {
    await page.goto(paths.puzzlesRated());
    await chooseSelfAssessment(page);
    const p = await currentPuzzle(page);
    const hint = page.getByTestId('hint-button');
    await hint.click();
    await expect(page.getByTestId('hint-warning')).toHaveText('Ein Hinweis zählt das Puzzle als nicht gelöst.');
    await expect(page.getByTestId('rating-result')).toHaveCount(0);
    await hint.click();
    await expect(page.getByTestId('puzzle-hint')).toHaveText(/^Schau dir (deinen|deine) \S+ auf [a-h][1-8] an\.$/);
    expect(await highlights(page, p.moves[1]!.slice(0, 2))).toContain('hint-piece');
    await expect(page.getByTestId('rating-result')).toContainText('−');
  });

  test('leaving an unfinished rated puzzle asks first', async ({ page }) => {
    await page.goto(paths.puzzlesRated());
    await chooseSelfAssessment(page);
    await currentPuzzle(page);
    await page.locator('a[href="/puzzles"]').filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Puzzle verlassen?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Es zählt dann als nicht gelöst.');
    await dialog.getByRole('button', { name: 'Weiterlösen' }).click();
    await expect(page).toHaveURL(/\/puzzles\/rated$/);
    await page.locator('a[href="/puzzles"]').filter({ visible: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Verlassen' }).click();
    await expect(page).toHaveURL(/\/puzzles$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Puzzles' })).toBeVisible();
  });

  test('after a reload the rating stays and no rated puzzle is served twice', async ({ page }) => {
    test.fixme(true, 'needs WP-08 persistence – enabled in the integration round');
    await page.goto(paths.puzzlesRated());
    await chooseSelfAssessment(page);
    const p = await currentPuzzle(page);
    await solve(page, p);
    const rating = await page.getByTestId('rating-result').textContent();
    await page.reload();
    const q = await currentPuzzle(page);
    expect(q.id).not.toBe(p.id);
    await expect(page.getByTestId('rating-chip')).toContainText(rating!.match(/\d[\d.]*/)![0]);
  });
});

test.describe('Lernmodus (P0-05)', () => {
  test('any checkmating move is accepted; motif tags and explanation follow (AC 2, 7)', async ({ page }) => {
    const p = seed('seed-0036'); // Doppelschach: Sf6# and Sd6# both mate
    const mates = matingMoves(p);
    expect(mates.length).toBeGreaterThanOrEqual(2);
    const other = mates.find((m) => m !== p.moves[1])!;
    await page.goto(`${paths.puzzlesLearn()}?puzzle=${p.id}`);
    await waitForPly(page, p, 1);
    await expect(page.getByTestId('puzzle-status')).toHaveText('Weiß am Zug. Setze matt in 1 Zug.');
    await playUci(page, other);
    await expect(panel(page)).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('puzzle-status')).toHaveText('Gelöst!');
    const expl = page.getByTestId('puzzle-explanation');
    await expect(expl.getByText('Doppelschach', { exact: true })).toBeVisible();
    await expect(expl).toContainText('Sf6# setzt matt'); // German notation
    await expect(page.getByTestId('puzzle-difficulty')).toContainText(String(p.rating));
  });

  test('wrong move → retry; three hint stages end in the playable solution (AC 3, 7)', async ({ page }) => {
    const p = seed('seed-0029'); // Springergabel, two solver moves
    await page.goto(`${paths.puzzlesLearn()}?puzzle=${p.id}`);
    await waitForPly(page, p, 1);
    await playUci(page, wrongMove(p));
    await expect(page.getByTestId('puzzle-status')).toHaveText('Nicht ganz. Versuch es nochmal.');
    await waitForPly(page, p, 1);
    const hint = page.getByTestId('hint-button');
    await expect(hint).toHaveText('Hinweis');
    await hint.click();
    await expect(page.getByTestId('puzzle-hint')).toHaveText(`Schau dir deinen Springer auf ${p.moves[1]!.slice(0, 2)} an. Denk an eine Gabel.`);
    expect(await highlights(page, p.moves[1]!.slice(0, 2))).toContain('hint-piece');
    await expect(hint).toHaveText('Noch ein Hinweis');
    await hint.click();
    await expect(page.getByTestId('puzzle-hint')).toHaveText(`Er will nach ${p.moves[1]!.slice(2, 4)}.`);
    expect(await highlights(page, p.moves[1]!.slice(2, 4))).toContain('hint-target');
    await expect(hint).toHaveText('Lösung zeigen');
    await hint.click();
    await expect(page.getByTestId('puzzle-status')).toHaveText('Hier ist die Lösung.');
    await waitForPly(page, p, p.moves.length);
    await expect(page.getByTestId('puzzle-status')).toHaveText('So geht die Lösung.');
    await expect(page.getByTestId('puzzle-explanation').getByText('Gabel', { exact: true })).toBeVisible();
    // Step through the solution with the navigation controls.
    await page.getByRole('button', { name: 'Zum Anfang' }).click();
    await expect(board(page)).toHaveAttribute('data-fen', fenAt(p, 1));
    await page.getByRole('button', { name: 'Vor' }).click();
    await expect(board(page)).toHaveAttribute('data-fen', fenAt(p, 2));
    await page.getByRole('button', { name: 'Zum Ende' }).click();
    await expect(board(page)).toHaveAttribute('data-fen', fenAt(p, p.moves.length));
    // "Gegen Bot ausspielen" starts from the task position.
    await page.getByRole('button', { name: 'Gegen Bot ausspielen' }).click();
    await expect(page).toHaveURL(/\/play\/position\?fen=/);
    expect(new URL(page.url()).searchParams.get('fen')).toBe(fenAt(p, 1));
  });
});

test.describe('Themen-Training (P0-06)', () => {
  test('≥ 20 motifs, difficulty filter, theme attempts update the success rate (AC 8)', async ({ page }) => {
    await page.goto(paths.puzzleThemes());
    const cards = page.getByTestId('theme-list').getByTestId('theme-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(20);
    const hanging = page.locator('[data-testid="theme-card"][data-theme="hangingPiece"]');
    await expect(hanging).toContainText('11 Puzzles');
    await expect(hanging).toContainText('Noch nicht trainiert');
    await page.getByRole('radio', { name: 'Leicht' }).click();
    await expect(page).toHaveURL(/\?d=easy$/);
    await expect(hanging).not.toContainText('11 Puzzles'); // Leicht = 300–500 around the start value 600
    await expect(hanging).toHaveAttribute('href', '/puzzles/themes/hangingPiece?d=easy');
    expect(await hasHorizontalScroll(page)).toBe(false);
    await hanging.click();
    await expect(page.getByText('Themen-Training: Hängende Figur').filter({ visible: true }).first()).toBeVisible();
    const p = await currentPuzzle(page);
    expect(p.themes).toContain('hangingPiece');
    expect(p.rating).toBeGreaterThanOrEqual(300);
    expect(p.rating).toBeLessThanOrEqual(500);
    await solve(page, p);
    await page.goBack(); // router history entry: the in-memory data layer stays (D-50)
    await expect(page).toHaveURL(/\/puzzles\/themes\?d=easy$/);
    await expect(page.locator('[data-testid="theme-card"][data-theme="hangingPiece"]')).toContainText('100 % gelöst');
  });
});

test.describe('Demo (P0-01)', () => {
  test('exactly 5 puzzles, call to action at the end, nothing persisted (AC 9)', async ({ page }) => {
    const bankRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/data/puzzles/')) bankRequests.push(r.url());
    });
    await page.goto(paths.puzzlesDemo());
    for (let i = 0; i < DEMO.length; i++) {
      await expect(page.getByTestId('demo-progress')).toHaveText(`Demo-Puzzle ${i + 1} von 5`);
      const p = await currentPuzzle(page, DEMO);
      expect(p.id).toBe(DEMO[i]!.id);
      await solve(page, p);
      await expect(page.getByTestId('puzzle-status')).toHaveText('Gelöst!');
      if (i < DEMO.length - 1) await page.getByTestId('next-puzzle').click();
    }
    expect(DEMO).toHaveLength(5);
    await expect(page.getByTestId('next-puzzle')).toHaveCount(0);
    await expect(page.getByTestId('demo-done')).toContainText('Das waren deine 5 Demo-Puzzles.');
    await expect(page.getByTestId('demo-cta')).toHaveAttribute('href', '/login');
    await expect(page.getByTestId('demo-cta')).toHaveText('Anmelden, um Fortschritt zu speichern');
    await expect(page.getByRole('button', { name: 'Gegen Bot ausspielen' })).toHaveCount(0);
    expect(bankRequests).toEqual([]);
    // `zz-theme` is the app shell's theme mirror (written on every page before React starts), not demo progress.
    const stored = await page.evaluate(async () => ({
      local: Object.keys(localStorage).filter((k) => k !== 'zz-theme'),
      session: Object.keys(sessionStorage),
      dbs: ((await indexedDB.databases?.()) ?? []).map((d) => d.name),
    }));
    expect(stored).toEqual({ local: [], session: [], dbs: [] });
  });
});

test.describe('Offline (NFR, D-25)', () => {
  // Array option values must be wrapped (Playwright reads `[value, options]`).
  test.use({ allowedConsoleErrors: [[/ERR_INTERNET_DISCONNECTED/, /Failed to load resource/, /Failed to fetch/], { scope: 'test' }] });

  test('after the bank is loaded, rated and learning mode keep working offline (AC 10)', async ({ page, context }) => {
    await page.goto(paths.puzzlesLearn());
    const first = await currentPuzzle(page);
    await openMode(page, 'Bewertete Puzzles');
    await chooseSelfAssessment(page);
    const rated = await currentPuzzle(page);

    await context.setOffline(true);
    await solve(page, rated);
    await expect(page.getByTestId('rating-result')).toContainText(/Puzzle-Rating \d+/);
    await page.getByTestId('next-puzzle').click();
    await expect(panel(page)).not.toHaveAttribute('data-puzzle-id', rated.id);
    const rated2 = await currentPuzzle(page);
    await solve(page, rated2);
    // The end-of-puzzle effects (focus, leave guard released) have run before we navigate away.
    await expect(page.getByTestId('next-puzzle')).toBeFocused();

    await openMode(page, 'Lernmodus');
    const learn = await currentPuzzle(page);
    await solve(page, learn);
    await page.getByTestId('next-puzzle').click();
    await expect(panel(page)).not.toHaveAttribute('data-puzzle-id', learn.id);
    await currentPuzzle(page);
    expect(first.id).toBeTruthy();
    await context.setOffline(false);
  });
});

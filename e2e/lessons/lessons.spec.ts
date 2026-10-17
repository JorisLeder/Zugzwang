/**
 * WP-06 e2e: Lernpfad, skip test, the lesson player with all five step types (fixture course, D-52), progress per step
 * with resume, stars, the end screen (next lesson, matching puzzles, practice game), 360 px and keyboard use.
 * Runs on desktop and mobile. Progress is stored in IndexedDB, so it survives a reload.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { hasHorizontalScroll } from '../support/app';
import { board, clickMove, readFen } from '../support/board';
import { expect, test } from '../support/fixtures';
import { COURSE, expectStep, keyboardMove, nextButton, passSkipTest, visible } from './helpers';

/** Lernpfad → skip test → fixture course → first lesson (client-side navigation only). */
async function openFixtureLesson(page: Page) {
  await page.goto(paths.learn());
  await expect(page.getByRole('heading', { level: 2, name: 'Stufe 0 · Neuling' })).toBeVisible();
  await passSkipTest(page);
  await page.locator(`[data-course-id="${COURSE}"]`).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Testkurs: Grundreihe' })).toBeVisible();
  await page.locator('[data-lesson-id="fixture-lesson"]').click();
  await expectStep(page, 'explanation', 0);
}

test.describe('Lernpfad (P0-12, D-38)', () => {
  test('stages 0–4, planned stages, Stufe 1 locked until the skip test is passed', async ({ page }) => {
    await page.goto(paths.learn());
    for (const name of ['Stufe 0 · Neuling', 'Stufe 1 · Einsteiger', 'Stufe 2 · Clubspieler', 'Stufe 3 · Fortgeschritten', 'Stufe 4 · Experte']) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    await expect(page.locator('[data-stage-id="1"]')).toHaveAttribute('data-status', 'locked');
    await expect(page.locator(`[data-course-id="${COURSE}"]`)).toHaveAttribute('data-status', 'locked');
    await expect(page.locator('[data-stage-id="4"]')).toContainText('in Vorbereitung');
    await passSkipTest(page);
    await expect(page.getByText('Freigeschaltet durch den Einstufungstest.')).toBeVisible();
    await expect(page.locator(`[data-course-id="${COURSE}"]`)).toHaveAttribute('data-status', 'open');
    await expect(page.getByTestId('skip-test-passed')).toBeVisible();
  });
});

test.describe('lesson player (AC 1, 3, 5)', () => {
  test('walks through all five step types and ends with stars, next lesson, puzzles and a practice game', async ({ page }) => {
    test.setTimeout(90_000);
    await openFixtureLesson(page);

    // 1 Erklärung: text, board with arrow and mark, "Diese Stellung gegen Bot spielen".
    await expect(visible(page.getByTestId('step-text'))).toContainText('Der schwarze König steht hinter seinen eigenen Bauern');
    await expect(board(page)).toHaveAttribute('data-fen', '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
    await expect(visible(page.getByRole('button', { name: 'Diese Stellung gegen Bot spielen' }))).toBeVisible();
    await nextButton(page).click();

    // 2 Demo: Vor/Zurück and autoplay with comments.
    await expectStep(page, 'demo', 1);
    const comment = visible(page.getByTestId('demo-comment'));
    await expect(comment).toContainText('Ausgangsstellung');
    await visible(page.getByRole('button', { name: 'Vor' })).click();
    await expect(comment).toContainText('Zug 1 von 2: a5');
    await visible(page.getByRole('button', { name: 'Zurück', exact: true }).and(page.locator('[aria-keyshortcuts="ArrowLeft"]'))).click();
    await expect(comment).toContainText('Ausgangsstellung');
    await visible(page.getByTestId('demo-autoplay')).click();
    await expect(comment).toContainText('Td8 – Matt!', { timeout: 8_000 });
    await nextButton(page).click();

    // 3 Finde den Zug: a wrong move counts and is taken back, the reply is auto-played, the variation Kf7 is accepted.
    await expectStep(page, 'find_move', 2);
    await expect(nextButton(page)).toBeDisabled();
    const start = await readFen(page);
    await clickMove(page, 'a1', 'a8');
    await expect(visible(page.getByTestId('find-move-status'))).toHaveText('Nicht ganz. Versuch es nochmal.');
    await expect(board(page)).toHaveAttribute('data-fen', start);
    await clickMove(page, 'f6', 'f7');
    await expect(board(page)).toHaveAttribute('data-fen', /^8\/5K1k\//); // 1…Kh7 auto-played
    await clickMove(page, 'a1', 'h1');
    await expect(visible(page.getByTestId('lesson-step'))).toHaveAttribute('data-phase', 'done');
    await expect(nextButton(page)).toBeEnabled();
    await nextButton(page).click();

    // 4 Quiz: per-option feedback.
    await expectStep(page, 'quiz', 3);
    await page.getByRole('button', { name: 'Patt – die Partie ist remis' }).click();
    await expect(visible(page.getByTestId('quiz-feedback'))).toContainText('Schwarz hat keinen regelgemäßen Zug');
    await nextButton(page).click();

    // 5 Ausspielen against the bot (Stockfish): 1.Kb6 Kb8 2.Rh8#.
    await expectStep(page, 'play_out', 4);
    await clickMove(page, 'c6', 'b6');
    await expect(board(page)).toHaveAttribute('data-fen', /^1k6\/8\/1K6\//, { timeout: 30_000 });
    await clickMove(page, 'h1', 'h8');
    await expect(visible(page.getByTestId('lesson-step'))).toHaveAttribute('data-outcome', 'success');
    await nextButton(page).click();

    // End screen: 1 mistake → 2 stars; next lesson, matching puzzles, practice game.
    const end = visible(page.getByTestId('lesson-end'));
    await expect(end).toHaveAttribute('data-stars', '2');
    await expect(end.getByRole('img', { name: /2 von 3/ })).toBeVisible();
    await expect(page.getByTestId('lesson-primary')).toHaveText('Nächste Lektion');
    await expect(page.getByTestId('lesson-primary')).toHaveAttribute('href', paths.lesson(COURSE, 'fixture-lesson-2'));
    await expect(page.getByTestId('matching-puzzles')).toHaveAttribute('href', paths.puzzleTheme('backRankMate'));
    const practice = page.getByTestId('practice-game');
    await expect(practice).toContainText('Übungspartie gegen');
    await practice.click();
    await expect(page).toHaveURL(/\/play\/game\//);
    await expect(board(page)).toBeVisible();
  });

  test('the next lesson unlocks after the first; the course page shows stars and progress', async ({ page }) => {
    test.setTimeout(90_000);
    await openFixtureLesson(page);
    // Walk quickly: explanation, demo, mate in two, quiz, play-out.
    await nextButton(page).click();
    await expectStep(page, 'demo', 1);
    await nextButton(page).click();
    await expectStep(page, 'find_move', 2);
    await clickMove(page, 'f6', 'g6');
    await expect(board(page)).toHaveAttribute('data-fen', /^6k1\/8\/6K1\//);
    await clickMove(page, 'a1', 'a8');
    await nextButton(page).click();
    await expectStep(page, 'quiz', 3);
    await page.getByRole('button', { name: 'Patt – die Partie ist remis' }).click();
    await nextButton(page).click();
    await expectStep(page, 'play_out', 4);
    await clickMove(page, 'c6', 'b6');
    await expect(board(page)).toHaveAttribute('data-fen', /^1k6\/8\/1K6\//, { timeout: 30_000 });
    await clickMove(page, 'h1', 'h8');
    await nextButton(page).click();
    await expect(visible(page.getByTestId('lesson-end'))).toHaveAttribute('data-stars', '3');
    await visible(page.getByTestId('lesson-end').getByRole('link', { name: 'Zurück zum Kurs' })).click();
    await expect(page.locator('[data-lesson-id="fixture-lesson"]')).toHaveAttribute('data-status', 'completed');
    await expect(page.locator('[data-lesson-id="fixture-lesson"]').getByRole('img', { name: /3 von 3/ })).toBeVisible();
    await expect(page.locator('[data-lesson-id="fixture-lesson-2"]')).toHaveAttribute('data-status', 'new');
    await expect(page.locator('[data-lesson-id="fixture-test"]')).toHaveAttribute('data-status', 'locked');
    await expect(page.getByText('1 von 2 Lektionen')).toBeVisible();
  });
});

test.describe('progress and resume (AC 2)', () => {
  test('leaving and reopening resumes at the same step', async ({ page }) => {
    await openFixtureLesson(page);
    await nextButton(page).click();
    await expectStep(page, 'demo', 1);
    await nextButton(page).click();
    await expectStep(page, 'find_move', 2);
    // Leave to the course page (client-side) – the row shows the saved step.
    await visible(page.getByTestId('lesson-course-link')).click();
    const row = page.locator('[data-lesson-id="fixture-lesson"]');
    await expect(row).toHaveAttribute('data-status', 'started');
    await expect(row).toContainText('Schritt 3 von 5');
    await row.click();
    await expectStep(page, 'find_move', 2);
    await expect(visible(page.getByTestId('resume-notice'))).toContainText('Du machst bei Schritt 3 weiter.');
    // The Lernpfad offers to continue there, too.
    await visible(page.getByTestId('lesson-course-link')).click();
    await page.getByRole('link', { name: 'Zum Lernpfad' }).click();
    await expect(page.getByTestId('next-lesson')).toContainText('Weiter bei Schritt 3 von 5');
  });

  test('reload resumes at the saved step (persistent data layer)', async ({ page }) => {
    await openFixtureLesson(page);
    await nextButton(page).click();
    await expectStep(page, 'demo', 1);
    await page.reload();
    await expectStep(page, 'demo', 1);
    await expect(visible(page.getByTestId('resume-notice'))).toBeVisible();
  });
});

test.describe('360 px and keyboard (AC 6)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('Lernpfad, course and lesson fit 360 px with the actions fixed at the bottom; everything works by keyboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'keyboard flow runs on the desktop project (360 px viewport set here)');
    test.setTimeout(90_000);
    await page.goto(paths.learn());
    await expect(page.getByRole('heading', { level: 2, name: 'Stufe 0 · Neuling' })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    // Skip test by keyboard: Tab to the link, Enter; answer with Tab/Enter; Enter = Weiter.
    await page.getByRole('link', { name: 'Einstufungstest starten' }).focus();
    await page.keyboard.press('Enter');
    await expectStep(page, 'quiz', 0);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.getByRole('button', { name: 'Schachmatt', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(nextButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expectStep(page, 'quiz', 1);
    await page.getByRole('button', { name: /Er wird in eine Dame, einen Turm/ }).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('lesson-primary')).toBeFocused();
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.keyboard.press('Enter');

    await page.locator(`[data-course-id="${COURSE}"]`).focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-lesson-id="fixture-lesson"]').focus();
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.keyboard.press('Enter');

    // Explanation: phone layout – board on top, text below, action bar fixed at the bottom.
    await expectStep(page, 'explanation', 0);
    const boardBox = (await board(page).boundingBox())!;
    const textBox = (await visible(page.getByTestId('step-text')).boundingBox())!;
    const bar = (await visible(page.getByTestId('action-bar')).boundingBox())!;
    expect(boardBox.width).toBeGreaterThanOrEqual(350);
    expect(textBox.y).toBeGreaterThanOrEqual(boardBox.y + boardBox.height - 1);
    expect(Math.round(bar.y + bar.height)).toBe(740);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.keyboard.press('ArrowRight');
    await expectStep(page, 'demo', 1);
    await page.keyboard.press('ArrowRight');
    await expect(visible(page.getByTestId('demo-comment'))).toContainText('Zug 1 von 2');
    await page.keyboard.press('ArrowRight');
    await expect(visible(page.getByTestId('demo-comment'))).toContainText('Td8 – Matt!');
    await page.keyboard.press('Enter');

    // Finde den Zug with the keyboard on the board; H = hint.
    await expectStep(page, 'find_move', 2);
    await page.keyboard.press('h');
    await expect(visible(page.getByTestId('find-move-hint'))).toBeVisible();
    await keyboardMove(page, 'f6', 'g6');
    await expect(board(page)).toHaveAttribute('data-fen', /^6k1\/8\/6K1\//);
    await keyboardMove(page, 'a1', 'a8');
    await expect(visible(page.getByTestId('lesson-step'))).toHaveAttribute('data-phase', 'done');
    await expect(nextButton(page)).toBeFocused();
    await page.keyboard.press('Enter');

    // Quiz by keyboard.
    await expectStep(page, 'quiz', 3);
    await page.getByRole('button', { name: 'Patt – die Partie ist remis' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // Ausspielen by keyboard.
    await expectStep(page, 'play_out', 4);
    await keyboardMove(page, 'c6', 'b6');
    await expect(board(page)).toHaveAttribute('data-fen', /^1k6\/8\/1K6\//, { timeout: 30_000 });
    await keyboardMove(page, 'h1', 'h8');
    await expect(visible(page.getByTestId('lesson-step'))).toHaveAttribute('data-outcome', 'success');
    await expect(nextButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    const end = visible(page.getByTestId('lesson-end'));
    await expect(end).toHaveAttribute('data-stars', '2'); // one hint
    await expect(page.getByTestId('lesson-primary')).toBeFocused();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});

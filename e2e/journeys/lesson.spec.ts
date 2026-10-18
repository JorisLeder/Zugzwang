/**
 * Core journey 4 – Lektion (PRD Kern-Abläufe 4): Lernpfad → course → lesson step by step (explanations, demo,
 * quizzes, exercises with one wrong try) → stars → the next lesson is unlocked and opens. Uses the real first course
 * of the content (`content/lessons/brett-und-figuren`). Fails on any console error.
 */
import { paths } from '../../src/app/paths';
import { completeOnboarding } from '../support/app';
import { board, readFen } from '../support/board';
import { playUci } from '../puzzles/helpers';
import { expect, test } from '../support/fixtures';
import { expectStep, lessonContent, nav, nextButton, player, visible, walkLesson, wrongFindMove } from './helpers';

const COURSE = 'brett-und-figuren';
const FIRST = lessonContent(COURSE, 'brett-und-feldnamen');
const SECOND = lessonContent(COURSE, 'turm-und-laeufer');

test.describe('Kern-Ablauf 4: Lektion', () => {
  // Desktop journey (1440×900); the phone runs of the journeys follow separately.
  test.skip(({ isMobile }) => isMobile, 'desktop journey');

  test('Lernpfad → course → lesson step by step → exercise → stars → next lesson unlocked', async ({ page }) => {
    test.setTimeout(90_000);
    await completeOnboarding(page, 'Neuling', 20);

    // Lernpfad: Stufe 0 is open, the first course is the suggested next step.
    await nav(page, 'Lernen');
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Stufe 0 · Neuling' })).toBeVisible();
    const courseCard = page.locator(`[data-course-id="${COURSE}"]`);
    await expect(courseCard).toHaveAttribute('data-status', 'open');
    await courseCard.click();

    // Course page: the first lesson is open, the second one still locked.
    await expect(page).toHaveURL(new RegExp(`/learn/${COURSE}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Brett und Figuren' })).toBeVisible();
    await expect(page.locator(`[data-lesson-id="${FIRST.id}"]`)).toHaveAttribute('data-status', 'new');
    await expect(page.locator(`[data-lesson-id="${SECOND.id}"]`)).toHaveAttribute('data-status', 'locked');
    await page.locator(`[data-lesson-id="${FIRST.id}"]`).click();
    await expect(page).toHaveURL(paths.lesson(COURSE, FIRST.id));

    // Step by step up to the first exercise ("Finde den Zug").
    const exercise = FIRST.steps.findIndex((s) => s.type === 'find_move');
    const step = FIRST.steps[exercise]!;
    if (step.type !== 'find_move') throw new Error('no exercise in the first lesson');
    await expect(visible(page.getByTestId('step-text'))).toBeVisible();
    await walkLesson(page, FIRST, 0, exercise);

    // The exercise: "Weiter" waits for the solution; a wrong move is marked and taken back, then the right one.
    await expectStep(page, step, exercise);
    await expect(nextButton(page)).toBeDisabled();
    const start = await readFen(page);
    await playUci(page, wrongFindMove(step));
    await expect(visible(page.getByTestId('find-move-status'))).toHaveText('Nicht ganz. Versuch es nochmal.');
    await expect(board(page)).toHaveAttribute('data-fen', start);
    await walkLesson(page, FIRST, exercise);

    // Stars: one mistake → 2 of 3; the next lesson is offered.
    const end = visible(page.getByTestId('lesson-end'));
    await expect(end).toHaveAttribute('data-stars', '2');
    await expect(end.getByRole('img', { name: /2 von 3/ })).toBeVisible();
    await expect(page.getByTestId('lesson-primary')).toHaveText('Nächste Lektion');
    await expect(page.getByTestId('lesson-primary')).toHaveAttribute('href', paths.lesson(COURSE, SECOND.id));

    // Course page: lesson 1 completed with its stars, lesson 2 unlocked, lesson 3 still locked.
    await visible(end.getByRole('link', { name: 'Zurück zum Kurs' })).click();
    await expect(page).toHaveURL(new RegExp(`/learn/${COURSE}$`));
    await expect(page.locator(`[data-lesson-id="${FIRST.id}"]`)).toHaveAttribute('data-status', 'completed');
    await expect(page.locator(`[data-lesson-id="${FIRST.id}"]`).getByRole('img', { name: /2 von 3/ })).toBeVisible();
    await expect(page.locator(`[data-lesson-id="${SECOND.id}"]`)).toHaveAttribute('data-status', 'new');
    await expect(page.locator('[data-lesson-id="dame-und-koenig"]')).toHaveAttribute('data-status', 'locked');
    await expect(page.getByText('1 von 6 Lektionen')).toBeVisible();

    // The unlocked lesson opens at its first step; the progress survives a reload.
    await page.locator(`[data-lesson-id="${SECOND.id}"]`).click();
    await expect(page).toHaveURL(paths.lesson(COURSE, SECOND.id));
    await expect(player(page)).toHaveAttribute('data-step-index', '0', { timeout: 10_000 });
    await page.goto(paths.course(COURSE));
    await expect(page.locator(`[data-lesson-id="${FIRST.id}"]`)).toHaveAttribute('data-status', 'completed');
  });
});

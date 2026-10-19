/**
 * Core journey 3 – Bot-Partie (PRD Kern-Abläufe 3): choose the weakest bot → assistance level → play the game to the
 * end (the learner's moves come from a Node Stockfish in the test, with one deliberately hung piece) → automatic
 * review with explanations → "Nochmal versuchen" on the mistake. Fails on any console error.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { BOT_ROSTER } from '../../src/bots/roster';
import type { EngineService } from '../../src/core/engine';
import { completeOnboarding } from '../support/app';
import { board, clickMove } from '../support/board';
import { expect, test } from '../support/fixtures';
import { createMoveEngine, nav, playGameToEnd, resultDialog, visible } from './helpers';

/** The learner's move (1-based) that hangs a knight or bishop on purpose. */
const BLUNDER_AT = 2;

/** Jumps to a ply via the move list of the review. */
async function goToPly(page: Page, ply: number) {
  await visible(page.getByRole('tab', { name: 'Züge' })).click();
  await visible(page.locator(`button[data-ply="${ply}"]`)).click();
  await expect(page.getByTestId('move-detail')).toHaveAttribute('data-ply', String(ply));
}

test.describe('Kern-Ablauf 3: Bot-Partie', () => {

  let engine: EngineService | undefined;
  test.afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  test('choose bot and level → play to the end → review with explanations → "Nochmal versuchen"', async ({ page }) => {
    test.setTimeout(300_000);
    engine = await createMoveEngine();
    const weakest = [...BOT_ROSTER].sort((a, b) => a.elo - b.elo)[0]!;
    await completeOnboarding(page, 'Einsteiger', 20);

    // Bot list → the weakest bot → assistance level and colour; no clock.
    await nav(page, 'Spielen');
    await expect(page).toHaveURL(/\/play$/);
    await page.locator(`[data-bot-id="${weakest.id}"]`).click();
    const setup = page.getByRole('dialog', { name: `Partie gegen ${weakest.name}` });
    await expect(setup.getByText('Ohne Uhr – du hast so viel Zeit, wie du brauchst.')).toBeVisible();
    await setup.getByRole('radio', { name: 'Training' }).click();
    await expect(setup.getByText('Zählt fürs Bot-Rating: nein')).toBeVisible();
    await setup.getByRole('radio', { name: 'Weiß' }).click();
    await setup.getByRole('button', { name: 'Partie starten' }).click();
    await expect(page).toHaveURL(/\/play\/game\/[0-9a-f-]+$/);
    await expect(board(page)).toBeVisible();
    await expect(visible(page.getByText(`Hilfe-Stufe: Training`))).toBeVisible();
    await expect(page.getByTestId('eval-bar').filter({ visible: true })).toHaveCount(1);

    // Play to the end.
    const played = await playGameToEnd(page, { userColor: 'w', engine, blunderAtMove: BLUNDER_AT });
    const result = resultDialog(page);
    await expect(result.getByTestId('game-result-reason')).not.toBeEmpty();
    await expect(result.getByText('Diese Partie zählt nicht fürs Bot-Rating.')).toBeVisible();
    test.info().annotations.push({ type: 'game', description: `${played.length} moves: ${await result.getByTestId('game-result-reason').innerText()}` });

    // Review: automatic analysis, summary, the hung piece as a mistake with an explanation.
    await result.getByRole('button', { name: 'Analyse ansehen' }).click();
    await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]+$/);
    await expect(page.getByTestId('review-panel')).toHaveAttribute('data-run', 'done', { timeout: 120_000 });
    const summary = page.getByTestId('review-summary');
    await expect(summary.getByTestId('accuracy-w')).toHaveText(/\d{1,3},\d\s%/);
    await expect(summary.getByTestId('key-moments').getByRole('button').first()).toBeVisible();

    const ply = 2 * BLUNDER_AT - 1;
    await goToPly(page, ply);
    const detail = page.getByTestId('move-detail');
    await expect(detail).toHaveAttribute('data-classification', /^(mistake|miss|blunder)$/);
    await expect(detail.getByTestId('explanation-teaser')).not.toBeEmpty();

    // "Nochmal versuchen": the position before the mistake; the move from the game three times reveals the better one.
    await detail.getByRole('button', { name: 'Nochmal versuchen' }).click();
    const retry = page.getByTestId('retry-panel');
    await expect(page.getByTestId('retry-task')).toHaveText('Weiß am Zug. Finde einen besseren Zug.');
    const mistake = played[BLUNDER_AT - 1]!;
    await expect(retry).toHaveAttribute('data-played', mistake);
    for (let i = 0; i < 3; i++) {
      await expect(retry).toHaveAttribute('data-phase', 'thinking', { timeout: 10_000 });
      await clickMove(page, mistake.slice(0, 2), mistake.slice(2, 4));
      await expect(retry).not.toHaveAttribute('data-phase', 'thinking');
      if (i < 2) await expect(page.getByTestId('retry-feedback')).toContainText('Nicht ganz');
    }
    await expect(retry).toHaveAttribute('data-phase', 'revealed', { timeout: 10_000 });
    await expect(page.getByTestId('retry-result')).toContainText('Der bessere Zug war:');
    await expect(board(page).locator('[data-arrow-kind="best"]')).toHaveCount(1);
    await expect(retry.getByTestId('explanation')).not.toBeEmpty();
    await page.getByRole('button', { name: 'Zurück zur Partie' }).click();

    // Full explanation (rule-based in local mode) with the better move.
    const explanation = detail.getByTestId('explanation');
    await expect(explanation).toHaveAttribute('data-source', 'rule');
    const sentences = (await explanation.innerText()).trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.length).toBeLessThanOrEqual(3);
    await expect(detail.getByTestId('best-move').first()).toContainText('Besser war:');

    // The game is listed in the analysis hub.
    await nav(page, 'Analyse');
    await expect(page).toHaveURL(new RegExp(`${paths.analysis()}$`));
    await expect(page.locator('[data-game-id]')).toHaveCount(1);
  });
});

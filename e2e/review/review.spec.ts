/**
 * WP-05 e2e: PGN import → automatic game review with the real engine (Stockfish worker), summary, classification
 * symbols on board and list, explanations (rule-based; LLM path against a mocked `explain` endpoint with fallback),
 * "Nochmal versuchen" (success and reveal paths), "Variante erkunden", duplicates and the hub.
 * Wave 1 (D-50): the data layer is in memory – every flow stays inside one page load (client-side navigation only);
 * the reload test is `fixme` until WP-08 is integrated.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { FIXTURE_GAME } from '../../src/core/testing/fixtures';
import { hasHorizontalScroll } from '../support/app';
import { board, clickMove, readFen } from '../support/board';
import { expect, test } from '../support/fixtures';

/** Short game with an obvious blunder: 3...Nf6?? allows 4.Qxf7#. */
const SHORT_BLUNDER_PGN = '[Event "Kurz"]\n[White "Anna"]\n[Black "Ben"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n';
const E2E_EXPLAIN_URL_KEY = 'zz-e2e-explain-url';
const EXPLAIN_URL = '/__e2e/explain';

/** The visible instance of a control that may exist twice (phone action bar vs desktop panel). */
function visible(page: Page, role: 'button' | 'link' | 'tab', name: string | RegExp) {
  return page.getByRole(role, { name }).filter({ visible: true }).first();
}

/** Opens the import page (client-side navigation keeps the in-memory data), imports `pgn` and waits for the review. */
async function importPgn(page: Page, pgn: string): Promise<string> {
  await page.getByLabel('PGN einfügen').fill(pgn);
  await page.getByRole('button', { name: 'Importieren' }).click();
  await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]+$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

async function waitForAnalysis(page: Page, timeout = 60_000) {
  await expect(page.getByTestId('review-panel')).toHaveAttribute('data-run', 'done', { timeout });
}

/** Jumps to a ply via the move list. */
async function goToPly(page: Page, ply: number) {
  await visible(page, 'tab', 'Züge').click();
  await page.locator(`button[data-ply="${ply}"]`).filter({ visible: true }).first().click();
  await expect(page.getByTestId('move-detail')).toHaveAttribute('data-ply', String(ply));
}

/** Navigates inside the app without a reload (keeps the in-memory data, D-50). */
async function clientNavigate(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test.describe('game review of an imported PGN (P0-10, P0-15)', () => {
  test('40-move fixture: automatic analysis ≤ 30 s, summary, symbols, explanation and both retry paths', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await page.goto(paths.analysisImport());
    const started = Date.now();
    const id = await importPgn(page, FIXTURE_GAME.pgn);
    await expect(page.getByTestId('analysis-progress')).toContainText(/Analysiere Zug \d+ von \d+|Eröffnung wird erkannt/);
    await expect(page.getByTestId('analysis-progress').getByRole('button', { name: 'Abbrechen' })).toBeVisible();
    // The UI stays responsive while the engine works: navigation through the moves.
    await page.keyboard.press('End');
    await expect(page.getByTestId('move-detail')).toHaveAttribute('data-ply', '80');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('move-detail')).toHaveAttribute('data-ply', '0');
    await waitForAnalysis(page);
    const seconds = (Date.now() - started) / 1000;
    testInfo.annotations.push({ type: 'analysis-seconds', description: seconds.toFixed(1) });
    if (testInfo.project.name === 'desktop') expect(seconds).toBeLessThanOrEqual(30);

    // Summary: accuracy (one decimal), counts per category, eval graph, 3–5 key moments, best move.
    const summary = page.getByTestId('review-summary');
    await expect(summary.getByTestId('accuracy-w')).toHaveText(/\d{1,3},\d\s%/);
    await expect(summary.getByTestId('accuracy-b')).toHaveText(/\d{1,3},\d\s%/);
    await expect(summary.getByTestId('classification-counts')).toBeVisible();
    await expect(summary.getByRole('slider', { name: /Bewertungsverlauf/ })).toHaveAttribute('aria-valuemax', '80');
    const moments = await summary.getByTestId('key-moments').getByRole('button').count();
    expect(moments).toBeGreaterThanOrEqual(3);
    expect(moments).toBeLessThanOrEqual(5);
    await expect(page.getByTestId('move-detail')).toContainText('Bester Zug in dieser Stellung:');

    // Every analysed position has a best move.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('move-detail').getByTestId('best-move').first()).toBeVisible();

    // The fixture blunder 14.Qc2: symbol on the board and in the list, teaser before the better move.
    await goToPly(page, FIXTURE_GAME.blunder.ply);
    const detail = page.getByTestId('move-detail');
    const cls = await detail.getAttribute('data-classification');
    expect(['mistake', 'miss', 'blunder']).toContain(cls);
    await expect(board(page).locator(`[data-annotation="c2"] [data-classification="${cls}"]`)).toBeVisible();
    await expect(page.locator(`button[data-ply="${FIXTURE_GAME.blunder.ply}"] [data-classification="${cls}"]`).filter({ visible: true })).toHaveCount(1);
    await expect(detail.getByTestId('explanation-teaser')).toContainText('Dc2');

    // "Nochmal versuchen" – success path with Txf2.
    await detail.getByRole('button', { name: 'Nochmal versuchen' }).click();
    expect(await readFen(page)).toBe(FIXTURE_GAME.blunder.fenBefore);
    await expect(page.getByTestId('retry-task')).toHaveText('Weiß am Zug. Finde einen besseren Zug.');
    await page.getByRole('button', { name: 'Hinweis' }).click();
    await expect(page.getByTestId('retry-hint')).toHaveText('Schau dir den Turm auf f1 an.');
    await clickMove(page, 'f1', 'f2');
    await expect(page.getByTestId('retry-panel')).toHaveAttribute('data-phase', 'success', { timeout: 10_000 });
    await expect(page.getByTestId('retry-result')).toContainText(/Genau!|Gut gefunden!/);
    await expect(page.getByTestId('retry-panel').getByTestId('explanation')).toHaveAttribute('data-source', 'rule');
    await page.getByRole('button', { name: 'Zurück zur Partie' }).click();

    // Full explanation (1–3 sentences, rule-based in local mode), better move as arrow and follow-up line.
    const explanation = detail.getByTestId('explanation');
    await expect(explanation).toHaveAttribute('data-source', 'rule');
    const text = (await explanation.innerText()).trim();
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.length).toBeLessThanOrEqual(3);
    await expect(detail.getByTestId('best-move').first()).toContainText('Besser war:');
    await expect(board(page).locator('[data-arrow-kind="best"]')).toHaveCount(1);

    // "Variante erkunden" opens the analysis board at the current position.
    const fen = await readFen(page);
    await detail.getByRole('button', { name: 'Variante erkunden' }).click();
    await expect(page).toHaveURL(/\/analysis\/board\?fen=/);
    expect(decodeURIComponent(new URL(page.url()).searchParams.get('fen') ?? '')).toBe(fen);

    // Hub lists the game with its accuracy; the import of the same game again opens it as duplicate.
    await clientNavigate(page, paths.analysis());
    const card = page.locator(`[data-game-id="${id}"]`);
    await expect(card).toContainText('Testspieler – Testbot');
    await expect(card.getByTestId('game-accuracy')).toContainText('Genauigkeit');
    await page.getByRole('link', { name: 'PGN importieren' }).first().click();
    const again = await importPgn(page, FIXTURE_GAME.pgn.replace('14. Qc2', '14. Qc2?? {Patzer}'));
    expect(again).toBe(id);
    await expect(page.getByText('Diese Partie war schon importiert – hier ist ihre Analyse.')).toBeVisible();
    await expect(page.getByTestId('analysis-progress')).toHaveCount(0);
    await clientNavigate(page, paths.analysis());
    await expect(page.locator('[data-game-id]')).toHaveCount(1);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});

test.describe('"Nochmal versuchen" – reveal path (DESIGN §8.1)', () => {
  test('three wrong tries with the move played in the game reveal the better move', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(paths.analysisImport());
    await importPgn(page, SHORT_BLUNDER_PGN);
    await waitForAnalysis(page);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await goToPly(page, 6);
    const detail = page.getByTestId('move-detail');
    await expect(detail).toHaveAttribute('data-classification', /mistake|miss|blunder/);
    await detail.getByRole('button', { name: 'Nochmal versuchen' }).click();
    const panel = page.getByTestId('retry-panel');
    await expect(page.getByTestId('retry-task')).toHaveText('Schwarz am Zug. Finde einen besseren Zug.');
    expect(await panel.getAttribute('data-played')).toBe('g8f6');
    for (let i = 0; i < 3; i++) {
      await expect(panel).toHaveAttribute('data-phase', 'thinking', { timeout: 5_000 });
      await clickMove(page, 'g8', 'f6');
      await expect(panel).not.toHaveAttribute('data-phase', 'thinking');
      if (i < 2) await expect(page.getByTestId('retry-feedback')).toContainText('Nicht ganz');
    }
    await expect(panel).toHaveAttribute('data-phase', 'revealed', { timeout: 5_000 });
    await expect(page.getByTestId('retry-result')).toContainText('Der bessere Zug war:');
    await expect(board(page).locator('[data-arrow-kind="best"]')).toHaveCount(1);
    await expect(panel.getByTestId('explanation')).toContainText('Sf6');
    await page.getByRole('button', { name: 'Zurück zur Partie' }).click();
    await expect(detail.getByTestId('explanation')).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Nochmal versuchen' })).toHaveCount(0);
  });
});

test.describe('explanations: LLM path with mocked endpoint and rule-based fallback (P0-11)', () => {
  test.use({ allowedConsoleErrors: [[/Failed to load resource/, /net::ERR_FAILED/], { scope: 'test' }] });

  async function reviewWithEndpoint(page: Page, handler: Parameters<Page['route']>[1]) {
    await page.addInitScript(
      ([key, url]) => {
        try {
          localStorage.setItem(key!, url!);
        } catch {
          // storage unavailable
        }
      },
      [E2E_EXPLAIN_URL_KEY, EXPLAIN_URL],
    );
    await page.route(`**${EXPLAIN_URL}`, handler);
    await page.goto(paths.analysisImport());
    await importPgn(page, SHORT_BLUNDER_PGN);
    await waitForAnalysis(page);
    await goToPly(page, 6);
    const detail = page.getByTestId('move-detail');
    await expect(detail).toHaveAttribute('data-classification', /mistake|miss|blunder/);
    await detail.getByRole('button', { name: 'Besseren Zug zeigen' }).click();
    return detail.getByTestId('explanation');
  }

  test('a valid LLM answer that names only engine-confirmed moves is shown', async ({ page }) => {
    test.setTimeout(90_000);
    let requests = 0;
    const explanation = await reviewWithEndpoint(page, async (route) => {
      requests += 1;
      const body = route.request().postDataJSON() as { facts: { playedMove?: { san: string } }; context: string; language: string };
      expect(body.context).toBe('analysis');
      expect(body.language).toBe('de');
      await route.fulfill({
        json: {
          ok: true,
          model: 'mock',
          segments: [
            { type: 'text', text: 'Nach ' },
            { type: 'move', san: body.facts.playedMove!.san },
            { type: 'text', text: ' ist der Punkt f7 nicht mehr gedeckt. Weiß setzt sofort matt.' },
          ],
        },
      });
    });
    await expect(explanation).toHaveAttribute('data-source', 'llm', { timeout: 15_000 });
    await expect(explanation).toContainText('ist der Punkt f7 nicht mehr gedeckt');
    expect(requests).toBeGreaterThan(0);
  });

  test('an LLM answer with a move outside the facts is rejected → rule-based explanation', async ({ page }) => {
    test.setTimeout(90_000);
    let requests = 0;
    const explanation = await reviewWithEndpoint(page, async (route) => {
      requests += 1;
      await route.fulfill({
        json: { ok: true, model: 'mock', segments: [{ type: 'text', text: 'Besser war ' }, { type: 'move', san: 'Ke2' }, { type: 'text', text: '.' }] },
      });
    });
    await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(explanation).toHaveAttribute('data-source', 'rule');
    await expect(explanation).toContainText('matt');
  });

  test('endpoint unavailable (network error) → rule-based explanation', async ({ page }) => {
    test.setTimeout(90_000);
    let requests = 0;
    const explanation = await reviewWithEndpoint(page, async (route) => {
      requests += 1;
      await route.abort('failed');
    });
    await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(explanation).toHaveAttribute('data-source', 'rule');
    await expect(explanation).toContainText('Sf6');
  });

  test('endpoint does not answer within 8 s (timeout) → rule-based explanation', async ({ page }) => {
    test.setTimeout(90_000);
    let requests = 0;
    const explanation = await reviewWithEndpoint(page, async (route) => {
      requests += 1;
      await new Promise((r) => setTimeout(r, 9_500));
      await route.fulfill({ json: { ok: true, model: 'mock', segments: [{ type: 'text', text: 'Zu spät.' }] } }).catch(() => undefined);
    });
    await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(9_000);
    await expect(explanation).toHaveAttribute('data-source', 'rule');
    await expect(explanation).not.toContainText('Zu spät');
  });
});

test.describe('PGN import errors (P0-15)', () => {
  test('an invalid PGN shows a German message with the line number', async ({ page }) => {
    await page.goto(paths.analysisImport());
    await page.getByLabel('PGN einfügen').fill('[Event "Test"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5\n2. Nf3 Nc6\n3. Nf9 Nf6 *');
    await page.getByRole('button', { name: 'Importieren' }).click();
    await expect(page.getByRole('alert')).toContainText('Zeile 7: Ungültiger Zug „Nf9“ (Zug 3, Weiß)');
    await expect(page).toHaveURL(/\/analysis\/import$/);
  });

  test('several games → selection list', async ({ page }) => {
    await page.goto(paths.analysisImport());
    const two = `${SHORT_BLUNDER_PGN}\n[White "Cem"]\n[Black "Dana"]\n\n1. f3 e5 2. g4 Qh4# 0-1\n`;
    await page.getByLabel('PGN einfügen').fill(two);
    await page.getByRole('button', { name: 'Importieren' }).click();
    const list = page.getByRole('list', { name: 'Partien in der PGN' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await list.getByRole('button', { name: 'Cem – Dana importieren und analysieren' }).click();
    await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]+$/);
    await expect(page.getByTestId('player-top').or(page.getByTestId('player-bottom')).first()).toBeVisible();
  });

  test('empty hub suggests a bot', async ({ page }) => {
    await page.goto(paths.analysis());
    await expect(page.getByRole('heading', { level: 1, name: 'Analyse' })).toBeVisible();
    await expect(page.getByText(/Spiel eine Partie gegen .+ \(\d+\)/)).toBeVisible();
    await page.getByRole('link', { name: 'Partie starten' }).click();
    await expect(page).toHaveURL(/\/play$/);
  });
});

test.describe('deep link (D-50)', () => {
  test.fixme('reload of /analysis/:gameId shows the stored analysis without re-analysing (needs WP-08 persistence)', async ({ page }) => {
    await page.goto(paths.analysisImport());
    const id = await importPgn(page, SHORT_BLUNDER_PGN);
    await waitForAnalysis(page);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/analysis/${id}$`));
    await expect(page.getByTestId('review-summary')).toBeVisible();
    await expect(page.getByTestId('analysis-progress')).toHaveCount(0);
  });
});

/**
 * WP-01 Analysebrett e2e (acceptance criterion 10 and the page instructions): editor, FEN/PGN import/export round
 * trips, engine lines (placeholder fake engine in wave 1, real Stockfish after integration), "Gegen Bot ausspielen",
 * move replacement with confirmation, navigation.
 */
import { readFileSync } from 'node:fs';
import { START_FEN } from '../../src/core/chess';
import { paths } from '../../src/app/paths';
import { board, clickMove, pieceOn, readFen, square, waitForFenChange } from '../support/board';
import { expect, test } from '../support/fixtures';
import { highlights, visible } from './helpers';

test.describe('position editor', () => {
  test('rejects illegal positions with German messages and applies legal ones', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await visible(page.getByRole('button', { name: 'Stellung aufbauen' })).click();
    const editorBoard = page.getByRole('application', { name: 'Stellungseditor' });
    await expect(editorBoard).toBeVisible();
    await page.getByRole('button', { name: 'Brett leeren' }).click();
    const validation = page.getByTestId('editor-validation');
    await expect(validation).toHaveText('Weiß braucht genau einen König.');
    const apply = visible(page.getByRole('button', { name: 'Stellung übernehmen' }));
    await expect(apply).toBeDisabled();

    // White king (default tool) on g1, black king on g8, white pawns on a8 (illegal) …
    await square(page, 'g1').click();
    await page.getByRole('button', { name: 'Schwarz: König setzen' }).click();
    await square(page, 'g8').click();
    await page.getByRole('button', { name: 'Weiß: Bauer setzen' }).click();
    await square(page, 'a8').click();
    await expect(validation).toHaveText('Bauern dürfen nicht auf der ersten oder achten Reihe stehen.');
    // … remove it again (second tap), add a queen giving check to the side not to move.
    await square(page, 'a8').click();
    await page.getByRole('button', { name: 'Weiß: Dame setzen' }).click();
    await square(page, 'g7').click();
    await expect(validation).toHaveText('Schwarz ist nicht am Zug, steht aber im Schach – diese Stellung kann nicht entstehen.');
    await page.getByRole('radio', { name: 'Schwarz am Zug' }).click();
    await expect(validation).toHaveText('Die Stellung ist gültig.');
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(board(page)).toHaveAttribute('data-fen', '6k1/6Q1/8/8/8/8/8/6K1 b - - 0 1');
    expect(await highlights(page, 'g8')).toContain('check');
    // The board is playable again (Black takes the queen).
    await clickMove(page, 'g8', 'g7');
    await expect(page.getByTestId('position-status')).toContainText('Remis: Keine Seite kann mehr mattsetzen');
  });

  test('castling rights and the en-passant square', async ({ page }) => {
    await page.goto(paths.analysisBoard({ fen: 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' }));
    await visible(page.getByRole('button', { name: 'Stellung aufbauen' })).click();
    await page.getByRole('checkbox', { name: 'Schwarz 0-0-0 (lang)' }).uncheck();
    await page.getByRole('combobox', { name: 'En-passant-Feld' }).click();
    await page.getByRole('option', { name: 'd6' }).click();
    // Removing the rook on h1 makes White's short castling impossible.
    await page.getByRole('button', { name: 'Figur entfernen' }).click();
    await square(page, 'h1').click();
    await expect(page.getByRole('checkbox', { name: 'Weiß 0-0 (kurz)' })).toBeDisabled();
    await visible(page.getByRole('button', { name: 'Stellung übernehmen' })).click();
    await expect(board(page)).toHaveAttribute('data-fen', 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBN1 w Qk d6 0 2');
    await clickMove(page, 'e5', 'd6');
    expect(await pieceOn(page, 'd5')).toBeNull();
  });

  test('cancel keeps the position', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await clickMove(page, 'e2', 'e4');
    const fen = await waitForFenChange(page, START_FEN);
    await visible(page.getByRole('button', { name: 'Stellung aufbauen' })).click();
    await page.getByRole('button', { name: 'Brett leeren' }).click();
    await visible(page.getByRole('button', { name: 'Abbrechen' })).click();
    await expect(board(page)).toHaveAttribute('data-fen', fen);
  });
});

test.describe('FEN/PGN import and export', () => {
  test('FEN round trip: export → import → same position; invalid FEN gives a German error', async ({ page }) => {
    await page.goto(paths.analysisBoard({ pgn: '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 *' }));
    const fen = await readFen(page);
    await expect(page.getByTestId('fen-output')).toHaveValue(fen);
    const input = page.getByRole('textbox', { name: 'FEN oder PGN laden' });
    await input.fill('4k3/4R3/8/8/8/8/8/4K3 w - - 0 1');
    await page.getByRole('button', { name: 'Laden', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Schwarz ist nicht am Zug, steht aber im Schach – diese Stellung kann nicht entstehen.',
    );
    await input.fill(START_FEN);
    await page.getByRole('button', { name: 'Laden', exact: true }).click();
    await expect(board(page)).toHaveAttribute('data-fen', START_FEN);
    await input.fill(fen);
    await page.getByRole('button', { name: 'Laden', exact: true }).click();
    await expect(board(page)).toHaveAttribute('data-fen', fen);
    // Also via the URL.
    await page.goto(paths.analysisBoard({ fen }));
    await expect(board(page)).toHaveAttribute('data-fen', fen);
  });

  test('PGN round trip: download → import → same game; invalid PGN gives a German error', async ({ page }) => {
    await page.goto(paths.analysisBoard({ fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1' }));
    await clickMove(page, 'e1', 'g1');
    let fen = await waitForFenChange(page, 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    await clickMove(page, 'e8', 'c8');
    fen = await waitForFenChange(page, fen);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PGN herunterladen' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('zugzwang-analyse.pgn');
    const pgn = readFileSync((await download.path())!, 'utf8');
    expect(pgn).toContain('[FEN "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1"]');
    expect(pgn).toContain('1. O-O O-O-O');

    await page.goto(paths.analysisBoard());
    const input = page.getByRole('textbox', { name: 'FEN oder PGN laden' });
    await input.fill('1. e4 e5 2. Sf3');
    await page.getByRole('button', { name: 'Laden', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Die PGN konnte nicht gelesen werden.');
    await input.fill(pgn);
    await page.getByRole('button', { name: 'Laden', exact: true }).click();
    await expect(board(page)).toHaveAttribute('data-fen', fen);
    await page.getByRole('tab', { name: 'Züge' }).click();
    await expect(page.getByRole('list', { name: 'Zugliste' }).getByRole('button')).toHaveText(['0-0', '0-0-0']);
  });

  test('invalid ?fen= shows a German error page', async ({ page }) => {
    await page.goto(paths.analysisBoard({ fen: '8/8/8/8/8/8/8/8 w - - 0 1' }));
    await expect(page.getByRole('heading', { level: 1, name: 'Analysebrett' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('Diese Stellung kann nicht geladen werden. Weiß braucht genau einen König.');
    await page.getByRole('link', { name: 'Leeres Analysebrett öffnen' }).click();
    await expect(board(page)).toHaveAttribute('data-fen', START_FEN);
  });
});

test.describe('engine, navigation, play against a bot', () => {
  test('engine lines with eval and depth appear when the engine is switched on', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await page.getByRole('switch', { name: 'Engine' }).click();
    const lines = page.getByTestId('engine-line');
    await expect(lines.first()).toBeVisible({ timeout: 20_000 });
    await expect(lines.first()).toContainText(/Tiefe \d+/);
    await expect(lines.first()).toContainText(/0,0|[+−]\d+,\d|−?M\d+/);
    await expect(board(page).locator('[data-arrow-kind="best"]')).toHaveCount(1);
    await expect(visible(page.getByTestId('eval-bar'))).toBeVisible();
    // A line follows the position (and the old search is stopped).
    await clickMove(page, 'e2', 'e4');
    await expect(lines.first()).toContainText('1…', { timeout: 20_000 });
    // Switching off hides the lines.
    await page.getByRole('switch', { name: 'Engine' }).click();
    await expect(lines).toHaveCount(0);
  });

  test('playing at an earlier ply asks before replacing the later moves', async ({ page }) => {
    await page.goto(paths.analysisBoard({ pgn: '1. e4 e5 2. Nf3 Nc6 *' }));
    const end = await readFen(page);
    await page.keyboard.press('Home');
    await expect(board(page)).toHaveAttribute('data-fen', START_FEN);
    await page.keyboard.press('ArrowRight');
    await clickMove(page, 'd7', 'd5');
    const dialog = page.getByRole('dialog', { name: 'Spätere Züge ersetzen?' });
    await expect(dialog).toContainText('werden die 3 folgenden Züge gelöscht');
    await dialog.getByRole('button', { name: 'Abbrechen' }).first().click();
    await expect(dialog).toBeHidden();
    await visible(page.getByRole('button', { name: 'Zum Ende' })).click();
    await expect(board(page)).toHaveAttribute('data-fen', end);
    await visible(page.getByRole('button', { name: 'Zum Anfang' })).click();
    await visible(page.getByRole('button', { name: 'Vor' })).click();
    await clickMove(page, 'd7', 'd5');
    await dialog.getByRole('button', { name: 'Züge ersetzen' }).click();
    await expect(board(page)).toHaveAttribute('data-fen', 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    await expect(visible(page.getByRole('button', { name: 'Vor' }))).toBeDisabled();
  });

  test('"Gegen Bot ausspielen" navigates with the FEN', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await clickMove(page, 'e2', 'e4');
    const fen = await waitForFenChange(page, START_FEN);
    await page.getByRole('button', { name: 'Gegen Bot ausspielen' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/play/position' && url.searchParams.get('fen') === fen);
  });
});

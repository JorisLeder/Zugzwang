/**
 * Smoke tests (BACKLOG 2.9/2.11): app shell, six areas, every route, 404, deep link, minimal board.
 * Runs on the `desktop` (1440×900) and `mobile` (390×844, touch) projects.
 */
import type { Page } from '@playwright/test';
import { START_FEN } from '../../src/core/chess';
import { paths } from '../../src/app/paths';
import { freshStart, hasHorizontalScroll } from '../support/app';
import { board, clickMove, dragMove, pieceOn, readFen, waitForFenChange } from '../support/board';
import { expect, test } from '../support/fixtures';

const AREAS = [
  { label: 'Start', url: '/', heading: 'Start' },
  { label: 'Puzzles', url: '/puzzles', heading: 'Puzzles' },
  { label: 'Spielen', url: '/play', heading: 'Spielen' },
  { label: 'Lernen', url: '/learn', heading: 'Lernpfad' },
  { label: 'Analyse', url: '/analysis', heading: 'Analyse' },
  { label: 'Profil', url: '/profile', heading: 'Profil' },
];

/** One concrete URL per route of paths.ts with the h1 it must show. */
const ROUTES: Array<[string, string]> = [
  [paths.home(), 'Start'],
  [paths.onboarding(), 'Willkommen bei Zugzwang'],
  [paths.login(), 'Anmelden'],
  [paths.puzzles(), 'Puzzles'],
  [paths.puzzlesRated(), 'Bewertete Puzzles'],
  [paths.puzzlesLearn(), 'Lernmodus'],
  [paths.puzzleThemes(), 'Themen-Training'],
  [paths.puzzleTheme('fork'), 'Themen-Training'],
  [paths.puzzlesDemo(), 'Demo-Puzzles'],
  [paths.play(), 'Spielen'],
  [paths.playGame('smoke-game'), 'Partie'],
  [paths.playFromPosition(START_FEN), 'Aus Stellung spielen'],
  [paths.learn(), 'Lernpfad'],
  [paths.course('smoke-course'), 'Kurs'],
  [paths.lesson('smoke-course', 'smoke-lesson'), 'Lektion'],
  [paths.analysis(), 'Analyse'],
  [paths.analysisImport(), 'PGN importieren'],
  [paths.analysisBoard(), 'Analysebrett'],
  [paths.analysisGame('smoke-game'), 'Partieanalyse'],
  [paths.profile(), 'Profil'],
  [paths.stats(), 'Statistik'],
  [paths.settings(), 'Einstellungen'],
];

function mainNav(page: Page) {
  return page.getByRole('navigation', { name: 'Hauptnavigation' });
}

test.describe('app shell', () => {
  test('loads with the six areas, dark theme by default', async ({ page }) => {
    await freshStart(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
    const nav = mainNav(page);
    await expect(nav).toBeVisible();
    for (const a of AREAS) await expect(nav.getByRole('link', { name: a.label, exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Start', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('every area is one click away', async ({ page }) => {
    await page.goto('/');
    for (const a of [...AREAS].reverse()) {
      await mainNav(page).getByRole('link', { name: a.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${a.url === '/' ? '/$' : `${a.url}$`}`));
      await expect(page.getByRole('heading', { level: 1, name: a.heading })).toBeVisible();
      await expect(mainNav(page).getByRole('link', { name: a.label, exact: true })).toHaveAttribute('aria-current', 'page');
    }
  });

  test('skip link is the first focusable element and moves focus to the content', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard navigation is checked on desktop');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Zum Inhalt springen' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
  });

  test('no horizontal scroll at 360 px; tab bar labels visible', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    for (const url of ['/', '/settings', paths.analysisBoard()]) {
      await page.goto(url);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(await hasHorizontalScroll(page), url).toBe(false);
    }
    await page.goto('/');
    for (const a of AREAS) await expect(mainNav(page).getByText(a.label, { exact: true })).toBeVisible();
  });

  test('breakpoints: tab bar below 768 px, rail 768–1279 px, labelled sidebar from 1280 px', async ({ page }) => {
    await page.goto('/');
    const nav = mainNav(page);
    const sizes: Array<[number, 'tabbar' | 'rail' | 'sidebar']> = [
      [767, 'tabbar'],
      [768, 'rail'],
      [1279, 'rail'],
      [1280, 'sidebar'],
    ];
    for (const [width, kind] of sizes) {
      await page.setViewportSize({ width, height: 800 });
      const box = await nav.boundingBox();
      expect(box, `nav at ${width}`).not.toBeNull();
      if (kind === 'tabbar') expect(box!.y).toBeGreaterThan(700);
      if (kind === 'rail') expect(Math.round(box!.width)).toBeLessThanOrEqual(72);
      if (kind === 'sidebar') expect(Math.round(box!.width)).toBeGreaterThan(200);
    }
  });

  test('light theme can be selected in the settings and survives navigation', async ({ page }) => {
    await page.goto(paths.settings());
    await page.getByRole('radio', { name: 'Hell' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await mainNav(page).getByRole('link', { name: 'Start', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('routes', () => {
  for (const [url, heading] of ROUTES) {
    test(`renders ${url}`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1, name: heading }).first()).toBeAttached();
    });
  }

  test('auth callback redirects to the start page in local mode', async ({ page }) => {
    await page.goto(paths.authCallback());
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
  });

  test('unknown paths show the 404 page', async ({ page }) => {
    await page.goto('/gibt-es-nicht/42');
    await expect(page.getByRole('heading', { level: 1, name: 'Seite nicht gefunden' })).toBeVisible();
    await page.getByRole('link', { name: 'Zur Startseite' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
  });

  test('deep link /analysis/:gameId works after reload', async ({ page }) => {
    await page.goto(paths.analysisGame('deep-link-42'));
    await expect(page.getByText('Partie deep-link-42')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Partieanalyse' })).toBeVisible();
    await expect(page.getByText('Partie deep-link-42')).toBeVisible();
  });
});

test.describe('minimal board', () => {
  test('click moves: only legal moves are accepted', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await expect(board(page)).toHaveAttribute('data-fen', START_FEN);
    await expect(board(page)).toHaveAttribute('data-orientation', 'white');
    await clickMove(page, 'e2', 'e5'); // illegal
    expect(await readFen(page)).toBe(START_FEN);
    await clickMove(page, 'e2', 'e4');
    const fen = await waitForFenChange(page, START_FEN);
    expect(fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(await pieceOn(page, 'e4')).toBe('wP');
    await clickMove(page, 'e7', 'e5');
    await waitForFenChange(page, fen);
    expect(await pieceOn(page, 'e5')).toBe('bP');
  });

  test('drag-and-drop moves; illegal drops snap back', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await dragMove(page, 'g1', 'g3'); // illegal knight move
    expect(await readFen(page)).toBe(START_FEN);
    await dragMove(page, 'g1', 'f3');
    await waitForFenChange(page, START_FEN);
    expect(await pieceOn(page, 'f3')).toBe('wN');
    expect(await pieceOn(page, 'g1')).toBeNull();
  });

  for (const piece of ['q', 'r', 'b', 'n'] as const) {
    test(`promotion offers all four pieces (choose ${piece})`, async ({ page }) => {
      const start = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
      await page.goto(paths.analysisBoard({ fen: start }));
      await expect(board(page)).toHaveAttribute('data-fen', start);
      await clickMove(page, 'a7', 'a8');
      for (const p of ['q', 'r', 'b', 'n']) await expect(page.getByTestId(`promotion-${p}`)).toBeVisible();
      await page.getByTestId(`promotion-${piece}`).click();
      await waitForFenChange(page, start);
      expect(await pieceOn(page, 'a8')).toBe(`w${piece.toUpperCase()}`);
    });
  }

  test('promotion by drag and Escape cancels', async ({ page, isMobile }) => {
    const start = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    await page.goto(paths.analysisBoard({ fen: start }));
    await dragMove(page, 'a7', 'a8');
    await expect(page.getByTestId('promotion-q')).toBeVisible();
    if (!isMobile) {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('promotion-q')).toBeHidden();
      expect(await pieceOn(page, 'a7')).toBe('wP');
      await dragMove(page, 'a7', 'a8');
    }
    await page.getByTestId('promotion-n').click();
    await waitForFenChange(page, start);
    expect(await pieceOn(page, 'a8')).toBe('wN');
  });
});

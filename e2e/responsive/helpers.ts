/**
 * Helpers for the phone checks (W3-2): an app with real data (onboarding done, an imported game with its review, a
 * running bot game), the list of every route, and in-page measurements for horizontal scroll, the bottom tab bar and
 * touch targets. Chess facts only via the rules layer (`src/lib/chess`).
 */
import { expect, type Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { BOT_ROSTER } from '../../src/bots/roster';
import { START_FEN } from '../../src/core/chess';
import { ChessGame } from '../../src/lib/chess';
import { completeOnboarding } from '../support/app';
import { board } from '../support/board';

/** Smallest touch target in CSS px (PRD: ≥ 44 × 44 on touch screens). */
export const MIN_TARGET = 44;

/** Phone widths (small Android, iPhone) with typical heights. */
export const PHONES = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
] as const;

/** A short game with a blunder (3...Nf6?? 4.Qxf7#) – quick to analyse. */
const PGN = '[Event "Handy"]\n[White "Anna"]\n[Black "Ben"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n';

/** A middlegame position (after 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6), built with the rules layer. */
const POSITION = ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6']).fen();

/** One route of the app. */
export interface AppRoute {
  /** URL to open. */
  url: string;
  /** Rendered without the shell (no tab bar, no sidebar); `/auth/callback` redirects to the start page in local mode. */
  bare?: boolean;
}

/** Ids of the data created by `prepareApp`. */
export interface AppData {
  /** An imported game (review at `/analysis/:id`). */
  reviewGameId: string;
  /** A running bot game (`/play/game/:id`). */
  botGameId: string;
}

/**
 * Fresh app → onboarding → PGN import (review opens) → a game against the weakest bot as White. Leaves the page on
 * the bot game.
 */
export async function prepareApp(page: Page): Promise<AppData> {
  await completeOnboarding(page, 'Einsteiger', 20);

  await page.goto(paths.analysisImport());
  await page.getByLabel('PGN einfügen').fill(PGN);
  await page.getByRole('button', { name: 'Importieren' }).click();
  await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]+$/);
  const reviewGameId = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByTestId('review-panel')).toHaveAttribute('data-run', 'done', { timeout: 60_000 });

  const weakest = [...BOT_ROSTER].sort((a, b) => a.elo - b.elo)[0]!;
  await page.goto(paths.play());
  await page.locator(`[data-bot-id="${weakest.id}"]`).click();
  const setup = page.getByRole('dialog', { name: `Partie gegen ${weakest.name}` });
  await setup.getByRole('radio', { name: 'Weiß' }).click();
  await setup.getByRole('button', { name: 'Partie starten' }).click();
  await expect(page).toHaveURL(/\/play\/game\/[0-9a-f-]+$/);
  await expect(board(page)).toBeVisible();
  const botGameId = new URL(page.url()).pathname.split('/').pop()!;
  return { reviewGameId, botGameId };
}

/** Every route of `ROUTE_PATTERNS` (plus not-found states), with real ids from `prepareApp`. */
export function allRoutes(data: AppData): AppRoute[] {
  return [
    { url: paths.home() },
    { url: paths.onboarding() },
    { url: paths.login(), bare: true },
    { url: paths.authCallback(), bare: true },
    { url: paths.puzzles() },
    { url: paths.puzzlesRated() },
    { url: paths.puzzlesLearn() },
    { url: paths.puzzleThemes() },
    { url: paths.puzzleTheme('fork') },
    { url: paths.puzzlesDemo() },
    { url: paths.play() },
    { url: paths.playGame(data.botGameId) },
    { url: paths.playGame('gibt-es-nicht') },
    { url: paths.playFromPosition(POSITION) },
    { url: paths.learn() },
    { url: paths.course('brett-und-figuren') },
    { url: paths.lesson('brett-und-figuren', 'brett-und-feldnamen') },
    { url: paths.analysis() },
    { url: paths.analysisImport() },
    { url: paths.analysisBoard() },
    { url: paths.analysisBoard({ pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *' }) },
    { url: paths.analysisGame(data.reviewGameId) },
    { url: paths.analysisGame('gibt-es-nicht') },
    { url: paths.profile() },
    { url: paths.stats() },
    { url: paths.settings() },
    { url: '/gibt-es-nicht' },
  ];
}

/** Opens a route and waits until its page (h1) is rendered and the network is quiet. */
export async function openRoute(page: Page, route: AppRoute): Promise<void> {
  await page.goto(route.url);
  await expect(page.locator('h1').first(), `h1 on ${route.url}`).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** Whether the current page is a board screen (`BoardLayout`). */
export async function isBoardScreen(page: Page): Promise<boolean> {
  return (await page.getByTestId('board-layout').count()) > 0;
}

/** Horizontal overflow of the document in px (0 = none). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}

/**
 * Visible elements that stick out of the viewport sideways without a clipping container of their own inside the
 * viewport (the body clips `overflow-x`, so such content would be cut off rather than scrollable). Outermost only.
 */
export async function elementsOutsideViewport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const outside = (r: DOMRect) => r.right > vw + 1 || r.left < -1;
    const flagged = new Set<Element>();
    const out: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || !outside(r)) continue;
      if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
      const cs = getComputedStyle(el);
      if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)') continue;
      let ok = false;
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        if (flagged.has(e)) {
          ok = true; // the ancestor is reported already
          break;
        }
        if (getComputedStyle(e).overflowX !== 'visible') {
          ok = !outside(e.getBoundingClientRect());
          break;
        }
      }
      if (ok) continue;
      flagged.add(el);
      const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      out.push(`<${el.tagName.toLowerCase()} class="${String(el.getAttribute('class') ?? '').slice(0, 50)}"> "${label}" ${Math.round(r.left)}–${Math.round(r.right)} px`);
    }
    return out.slice(0, 5);
  });
}

/** A touch target that is too small. */
export interface TargetProblem {
  what: string;
  width: number;
  height: number;
}

/**
 * Interactive elements of the page that are smaller than `MIN_TARGET` in either direction (visible ones only;
 * visually hidden 1 px elements such as the skip link are ignored).
 */
export async function smallTouchTargets(page: Page, min = MIN_TARGET): Promise<TargetProblem[]> {
  return page.evaluate((minSize) => {
    const SELECTOR = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="radio"]',
      '[role="checkbox"]',
      '[role="switch"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="slider"]',
    ].join(',');
    const describe = (el: Element) => {
      const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const testId = el.closest('[data-testid]')?.getAttribute('data-testid');
      const role = el.getAttribute('role');
      return `<${el.tagName.toLowerCase()}${role ? ` role="${role}"` : ''}${testId ? ` in ${testId}` : ''}> "${label}"`;
    };
    // Visually hidden until focused (skip link): clipped to nothing, not a touch target.
    const clippedAway = (el: Element) => {
      const cs = getComputedStyle(el);
      return cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)';
    };
    const out: { what: string; width: number; height: number }[] = [];
    for (const el of Array.from(document.querySelectorAll(SELECTOR))) {
      if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if ((r.width <= 1 && r.height <= 1) || clippedAway(el)) continue; // visually hidden (sr-only)
      // A native control wrapped by a big enough label counts as the label's target.
      const label = el.closest('label');
      const box = label && el.matches('input') ? label.getBoundingClientRect() : r;
      if (box.width + 0.5 < minSize || box.height + 0.5 < minSize) {
        out.push({ what: describe(el), width: Math.round(box.width), height: Math.round(box.height) });
      }
    }
    return out;
  }, min);
}

/**
 * The bottom tab bar: present, at the bottom edge of the viewport, six areas of at least `MIN_TARGET` that are not
 * covered by anything (also when scrolled to the end), and the end of the page content is not hidden behind it.
 */
export async function tabBarProblems(page: Page): Promise<string[]> {
  const problems = await page.evaluate(async (minSize) => {
    const out: string[] = [];
    const navs = Array.from(document.querySelectorAll('nav[aria-label="Hauptnavigation"]')).filter((n) => n.checkVisibility());
    if (navs.length !== 1) return [`expected 1 visible main navigation, found ${navs.length}`];
    const nav = navs[0]!;
    const nr = nav.getBoundingClientRect();
    if (Math.abs(nr.bottom - window.innerHeight) > 1) out.push(`tab bar bottom ${nr.bottom} ≠ viewport ${window.innerHeight}`);
    if (nr.left > 0.5 || Math.abs(nr.right - window.innerWidth) > 1) out.push(`tab bar not full width (${nr.left}–${nr.right})`);
    const links = Array.from(nav.querySelectorAll('a[href]'));
    if (links.length !== 6) out.push(`expected 6 tab bar links, found ${links.length}`);
    const checkLinks = (when: string) => {
      for (const a of links) {
        const r = a.getBoundingClientRect();
        const name = (a.textContent ?? '').trim();
        if (r.width + 0.5 < minSize || r.height + 0.5 < minSize) out.push(`tab "${name}" ${Math.round(r.width)}×${Math.round(r.height)} px`);
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !a.contains(hit)) {
          const by = hit ? `<${hit.tagName.toLowerCase()} class="${String(hit.getAttribute('class') ?? '').slice(0, 60)}">` : 'nothing';
          out.push(`tab "${name}" covered by ${by} (${when})`);
        }
      }
    };
    checkLinks('top');
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    checkLinks('scrolled to the end');
    window.scrollTo(0, 0);
    return out;
  }, MIN_TARGET);
  return [...problems, ...(await coveredContent(page, 'nav[aria-label="Hauptnavigation"]', '#main'))];
}

/**
 * Content of `root` that a fixed bottom bar (`bar`) hides when everything is scrolled to the end: interactive elements
 * and text blocks whose bottom lies below the bar's top. Elements inside fixed/sticky containers must not overlap the
 * bar at all; elements clipped away by their own scroll container are ignored.
 */
export async function coveredContent(page: Page, bar: string, root: string): Promise<string[]> {
  return page.evaluate(
    async ({ barSel, rootSel }) => {
      const out: string[] = [];
      const barEl = Array.from(document.querySelectorAll(barSel)).find((b) => b.checkVisibility());
      const rootEl = document.querySelector(rootSel);
      if (!barEl || !rootEl) return out;
      // Scroll the document and every scroll container of the root to the end.
      window.scrollTo(0, document.documentElement.scrollHeight);
      for (const el of Array.from(rootEl.querySelectorAll('*'))) {
        const o = getComputedStyle(el).overflowY;
        if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const top = barEl.getBoundingClientRect().top;
      const pinned = (el: Element) => {
        for (let e: Element | null = el; e && e !== rootEl; e = e.parentElement) {
          const pos = getComputedStyle(e).position;
          if (pos === 'fixed' || pos === 'sticky') return e;
        }
        return null;
      };
      const clipped = (el: Element, r: DOMRect) => {
        for (let e = el.parentElement; e && e !== rootEl; e = e.parentElement) {
          const o = getComputedStyle(e).overflowY;
          if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
            const cr = e.getBoundingClientRect();
            if (r.top >= cr.bottom - 0.5 || r.bottom <= cr.top + 0.5) return true;
          }
        }
        return false;
      };
      const name = (el: Element) => `<${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
      const content = rootEl.querySelectorAll(
        'a[href],button,input,select,textarea,[role="button"],[role="tab"],[role="radio"],[role="switch"],h1,h2,h3,p,li',
      );
      for (const el of Array.from(content)) {
        if (barEl.contains(el) || !el.checkVisibility()) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 && r.height <= 1) continue;
        const pin = pinned(el);
        if (pin) {
          if (getComputedStyle(pin).position === 'fixed' && !pin.contains(barEl) && r.bottom > top + 0.5 && r.top < window.innerHeight) {
            out.push(`fixed ${name(el)} lies on the bottom bar`);
          }
          continue;
        }
        if (clipped(el, r)) continue;
        if (r.bottom > top + 0.5) out.push(`${name(el)} hidden behind the bottom bar (bottom ${Math.round(r.bottom)} > ${Math.round(top)})`);
      }
      window.scrollTo(0, 0);
      return out;
    },
    { barSel: bar, rootSel: root },
  );
}

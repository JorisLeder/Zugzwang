/**
 * Recomputes the contrast tables of DESIGN.md §2.4 from `tokens.css` (WCAG 2.2 relative luminance) and fails when a
 * pair drops below its target (4.5 text, 3.0 non-text) or drifts from the documented value.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

type Rgba = [number, number, number, number];

/** Custom properties declared in the first block that matches `selector`. */
function block(selector: string): Record<string, string> {
  const re = new RegExp(`${selector.replace(/[[\]"]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`);
  const body = re.exec(css)?.[1];
  if (!body) throw new Error(`block ${selector} not found`);
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/(--zz-[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]!] = m[2]!.replace(/\/\*.*?\*\//g, '').trim();
  return vars;
}

/** All blocks with the same selector merged (later wins). */
function blocks(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`(^|\\n)${selector.replace(/[[\]"]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`, 'g');
  for (const m of css.matchAll(re)) {
    for (const v of m[2]!.matchAll(/(--zz-[\w-]+)\s*:\s*([^;]+);/g)) out[v[1]!] = v[2]!.replace(/\/\*.*?\*\//g, '').trim();
  }
  return out;
}

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1]!;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgb = /^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  throw new Error(`unsupported colour ${value}`);
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgba) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
/** `top` (with alpha) painted over the opaque `base`. */
const over = (top: Rgba, base: Rgba): Rgba => [
  top[0] * top[3] + base[0] * (1 - top[3]),
  top[1] * top[3] + base[1] * (1 - top[3]),
  top[2] * top[3] + base[2] * (1 - top[3]),
  1,
];

const dark = block(':root');
const light = block(':root[data-theme="light"]');
const boardShared = blocks(':root');
const holz = block(':root[data-board="holz"]');
const theme = { dark, light };
const color = (t: 'dark' | 'light', name: string) => parseColor(theme[t][`--zz-${name}`]!);

const SURFACES = ['bg', 'surface', 'surface-2', 'surface-3'] as const;

/** DESIGN §2.4 "Text tokens on every surface". */
const TEXT_TABLE: Array<[string, 'dark' | 'light', [number, number, number, number]]> = [
  ['text', 'dark', [16.02, 14.4, 12.69, 10.81]],
  ['text', 'light', [15.5, 17.18, 14.71, 13.18]],
  ['text-muted', 'dark', [7.39, 6.64, 5.85, 4.98]],
  ['text-muted', 'light', [6.68, 7.4, 6.33, 5.67]],
  ['accent-text', 'dark', [9.36, 8.41, 7.41, 6.31]],
  ['accent-text', 'light', [5.62, 6.23, 5.33, 4.77]],
  ['danger-text', 'dark', [7.16, 6.44, 5.67, 4.83]],
  ['danger-text', 'light', [5.9, 6.54, 5.59, 5.01]],
  ['warning-text', 'dark', [10.1, 9.08, 8.0, 6.81]],
  ['warning-text', 'light', [5.35, 5.93, 5.07, 4.55]],
  ['info-text', 'dark', [8.46, 7.6, 6.7, 5.7]],
  ['info-text', 'light', [5.81, 6.44, 5.51, 4.94]],
  ['text-disabled', 'dark', [3.95, 3.55, 3.13, 2.67]],
  ['text-disabled', 'light', [2.52, 2.79, 2.39, 2.14]],
];

/** DESIGN §2.4 "Fills, tinted backgrounds and non-text": [fg, bg, dark, light, target]. */
const FILL_TABLE: Array<[string, string, number, number, number]> = [
  ['on-accent', 'accent', 8.03, 5.13, 4.5],
  ['on-accent', 'accent-hover', 9.23, 6.43, 4.5],
  ['on-accent', 'accent-active', 6.56, 8.25, 4.5],
  ['on-danger', 'danger', 4.66, 5.62, 4.5],
  ['on-warning', 'warning', 10.0, 10.0, 4.5],
  ['text', 'accent-subtle', 12.09, 14.66, 4.5],
  ['accent-text', 'accent-subtle', 7.06, 5.31, 4.5],
  ['text', 'danger-subtle', 13.43, 14.15, 4.5],
  ['danger-text', 'danger-subtle', 6.0, 5.38, 4.5],
  ['text', 'warning-subtle', 11.77, 15.07, 4.5],
  ['warning-text', 'warning-subtle', 7.42, 5.2, 4.5],
  ['text-muted', 'warning-subtle', 5.43, 6.49, 4.5],
  ['text', 'info-subtle', 12.94, 14.36, 4.5],
  ['info-text', 'info-subtle', 6.83, 5.38, 4.5],
  ['text-muted', 'info-subtle', 5.97, 6.18, 4.5],
  ['focus', 'bg', 8.94, 5.19, 3],
  ['focus', 'surface', 8.03, 5.75, 3],
  ['focus', 'surface-2', 7.08, 4.92, 3],
  ['focus', 'surface-3', 6.03, 4.41, 3],
  ['border-strong', 'bg', 3.9, 3.39, 3],
  ['border-strong', 'surface', 3.5, 3.75, 3],
  ['border-strong', 'surface-2', 3.09, 3.21, 3],
  ['accent', 'bg', 8.1, 4.63, 3],
  ['accent', 'surface', 7.28, 5.13, 3],
  ['accent', 'surface-3', 5.46, 3.93, 3],
];

/** DESIGN §2.3 badge ink:fill ratios. */
const BADGES: Array<[string, number]> = [
  ['brilliant', 7.23],
  ['great', 5.04],
  ['best', 6.86],
  ['excellent', 8.79],
  ['good', 7.2],
  ['book', 6.0],
  ['inaccuracy', 11.0],
  ['mistake', 8.0],
  ['miss', 6.04],
  ['blunder', 4.79],
];

const EXACT = 0.011; // pure hex pairs: documented values are rounded to 2 decimals
const COMPOSITE = 0.03; // alpha-composited pairs: the designer composited in 8-bit, we in floating point

describe('DESIGN §2.4 – text tokens on every surface (≥ 4.5:1)', () => {
  for (const [token, t, expected] of TEXT_TABLE) {
    it(`${token} (${t})`, () => {
      SURFACES.forEach((surface, i) => {
        const r = ratio(color(t, token), color(t, surface));
        expect(Math.abs(r - expected[i]!), `${token} on ${surface}: ${r.toFixed(2)}`).toBeLessThanOrEqual(EXACT);
        if (token !== 'text-disabled') expect(r, `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});

describe('DESIGN §2.4 – fills, tinted backgrounds and non-text', () => {
  for (const [fg, bg, d, l, target] of FILL_TABLE) {
    it(`${fg} on ${bg}`, () => {
      for (const [t, expected] of [['dark', d], ['light', l]] as const) {
        const r = ratio(color(t, fg), color(t, bg));
        expect(Math.abs(r - expected), `${t}: ${r.toFixed(2)}`).toBeLessThanOrEqual(EXACT);
        expect(r).toBeGreaterThanOrEqual(target);
      }
    });
  }
});

describe('DESIGN §2.4 – board (Moos / Holz)', () => {
  const shared = (name: string) => parseColor(boardShared[`--zz-${name}`]!);
  const boards = {
    moos: { light: shared('sq-light'), dark: shared('sq-dark'), coordLight: shared('coord-on-light'), coordDark: shared('coord-on-dark') },
    holz: {
      light: parseColor(holz['--zz-sq-light']!),
      dark: parseColor(holz['--zz-sq-dark']!),
      coordLight: parseColor(holz['--zz-coord-on-light']!),
      coordDark: parseColor(holz['--zz-coord-on-dark']!),
    },
  };
  const dot = (base: Rgba) => Math.max(ratio(over(shared('dot-core'), base), base), ratio(over(shared('dot-ring'), base), base));
  const withLast = (base: Rgba) => over(shared('hl-lastmove'), base);
  const hint = (base: Rgba) => Math.max(ratio(shared('hint-ring-dark'), base), ratio(shared('hint-ring-light'), base));
  const expected = {
    moos: { squares: 4.01, coordLight: 5.82, coordDark: 4.66, dotL: 4.0, dotD: 4.12, dotLastL: 3.87, dotLastD: 3.06, hintL: 8.36, hintD: 4.66, cursorL: 16.25, cursorD: 4.06 },
    holz: { squares: 3.43, coordLight: 5.67, coordDark: 4.86, dotL: 3.8, dotD: 4.28, dotLastL: 3.76, dotLastD: 3.05, hintL: 6.87, hintD: 4.86, cursorL: 13.35, cursorD: 3.89 },
  };

  for (const name of ['moos', 'holz'] as const) {
    it(name, () => {
      const b = boards[name];
      const e = expected[name];
      const checks: Array<[string, number, number, number, number]> = [
        ['light vs dark square', ratio(b.light, b.dark), e.squares, EXACT, 3],
        ['coordinate on light square', ratio(b.coordLight, b.light), e.coordLight, EXACT, 4.5],
        ['coordinate on dark square', ratio(b.coordDark, b.dark), e.coordDark, EXACT, 4.5],
        ['legal-move dot – light', dot(b.light), e.dotL, COMPOSITE, 3],
        ['legal-move dot – dark', dot(b.dark), e.dotD, COMPOSITE, 3],
        ['dot on last-move light', dot(withLast(b.light)), e.dotLastL, COMPOSITE, 3],
        ['dot on last-move dark', dot(withLast(b.dark)), e.dotLastD, COMPOSITE, 3],
        ['hint ring – light', hint(b.light), e.hintL, EXACT, 3],
        ['hint ring – dark', hint(b.dark), e.hintD, EXACT, 3],
        ['keyboard cursor – light', ratio(shared('board-focus-dark'), b.light), e.cursorL, EXACT, 3],
        ['keyboard cursor – dark', ratio(shared('board-focus-dark'), b.dark), e.cursorD, EXACT, 3],
      ];
      for (const [label, r, documented, tol, target] of checks) {
        expect(Math.abs(r - documented), `${label}: ${r.toFixed(2)} vs ${documented}`).toBeLessThanOrEqual(tol);
        expect(r, label).toBeGreaterThanOrEqual(target);
      }
    });
  }

  it('eval bar white vs black part', () => {
    const r = ratio(shared('eval-white'), shared('eval-black'));
    expect(Math.abs(r - 10.21)).toBeLessThanOrEqual(EXACT);
  });
});

describe('DESIGN §2.3 – classification badge ink on fill (≥ 4.5:1)', () => {
  for (const [key, documented] of BADGES) {
    it(key, () => {
      const fill = parseColor(boardShared[`--zz-cls-${key}`]!);
      const ink = parseColor(boardShared[`--zz-cls-${key}-ink`]!);
      const r = ratio(ink, fill);
      expect(Math.abs(r - documented), r.toFixed(2)).toBeLessThanOrEqual(EXACT);
      expect(r).toBeGreaterThanOrEqual(4.5);
    });
  }
});

# Zugzwang – Design System and UX Spec (V1)

Owner: designer · Status: v1.0, binding for all UI work · Sources: `docs/PRD.md` (sections "UX und Informationsarchitektur",
"Funktionsumfang V1", P0-01 … P0-16), `docs/team/CONSTRAINTS.md`.

This file tells coders exactly what to build: token values, sizes, states and German copy. If something you need is
missing here, ask the manager (do not invent a new style). Changes to this file go through the designer.

Contents
1. Principles
2. Tokens (colour, board, move classification, contrast, typography, spacing, radii, shadows, motion, z-index)
3. Layout (app shell, six areas, board screens desktop and phone, non-board screens)
4. Board presentation
5. Components
6. Motion and sound
7. Accessibility
8. Learning design (hints, feedback timing, explanations, celebration vs noise, Einfache Ansicht)
9. Microcopy (German, "du")
10. chess.com patterns: adopted vs not copied
11. Implementation notes and review checklist
12. Open points for the manager

---

## 1. Principles

1. **One next step.** Every screen has exactly one primary action (green button). The learner never wonders what to do next.
2. **Board first.** On every board screen the board is as large as the viewport allows; nothing overlays it except
   board markers, the promotion picker and the game-end sheet.
3. **Feedback is instant and in place.** Right/wrong appears on the board square within 100 ms, not in a toast.
4. **Why before what, in at most 3 sentences.** Explanations name the consequence first, then the better move.
5. **Calm by default.** Small acknowledgements for every correct move, celebrations only for milestones. No noise, no guilt.
6. **Accessible by construction.** All text tokens ≥ 4.5:1, all touch targets ≥ 44 px, full keyboard operation.
7. **Own identity, proven patterns.** Layout and interaction patterns follow chess.com; colours, names, avatars,
   pieces and sounds are our own.

---

## 2. Tokens

All tokens are CSS custom properties prefixed `--zz-`. **Dark is the default** (`:root`); the light theme is applied with
`<html data-theme="light">`. There is no automatic switch by OS preference: the setting "Design" offers *Dunkel* (Standard)
and *Hell* (PRD: "Dunkles Design als Standard, helles wählbar").

Components use only tokens (via Tailwind utilities, see 2.10). No raw hex values in components; no Tailwind default
palette classes (`bg-gray-800`, `text-green-500` …).

### 2.1 Colour tokens – app UI

```css
/* src/styles/tokens.css (suggested path) */
:root {                                   /* DARK – default */
  color-scheme: dark;
  --zz-bg:             #171614;  /* page background */
  --zz-surface:        #22201D;  /* cards, panel, sidebar */
  --zz-surface-2:      #2C2A26;  /* raised: coach bubble, inputs, hover on surface */
  --zz-surface-3:      #383531;  /* selected row, current move, pressed, toast */
  --zz-border:         #3B3833;  /* decorative dividers and card borders */
  --zz-border-strong:  #7A7468;  /* input borders, segmented control outline (≥ 3:1) */

  --zz-text:           #F3F1EC;  /* primary text */
  --zz-text-muted:     #ABA59A;  /* secondary text, meta, move numbers */
  --zz-text-disabled:  #7A756C;  /* disabled controls only (WCAG-exempt) */

  --zz-accent:         #7CBF4A;  /* primary button fill, progress fill, active nav */
  --zz-accent-hover:   #8CCB5B;
  --zz-accent-active:  #6CAD3C;
  --zz-on-accent:      #0F1A07;  /* text/icons on accent fill */
  --zz-accent-text:    #8FCB5C;  /* green text and links on surfaces */
  --zz-accent-subtle:  #22321A;  /* success message background */

  --zz-danger:         #D7373D;  /* destructive button fill */
  --zz-on-danger:      #FFFFFF;
  --zz-danger-text:    #FF7A7A;
  --zz-danger-subtle:  #3A1E1F;  /* error message background */

  --zz-warning:        #F2B84B;  /* warning fill, streak flame */
  --zz-on-warning:     #1F1600;
  --zz-warning-text:   #F2B84B;
  --zz-warning-subtle: #3A2E14;  /* warning/offline banner background */

  --zz-info-text:      #7DB6F0;
  --zz-info-subtle:    #1A2A3B;  /* info / local-mode banner background */

  --zz-focus:          #8AB8FF;  /* focus ring */
  --zz-scrim:          rgb(0 0 0 / 0.60);  /* behind dialogs and sheets */
}

:root[data-theme="light"] {               /* LIGHT */
  color-scheme: light;
  --zz-bg:             #F5F3EF;
  --zz-surface:        #FFFFFF;
  --zz-surface-2:      #F0EDE7;
  --zz-surface-3:      #E5E1D9;
  --zz-border:         #DCD7CD;
  --zz-border-strong:  #8A8377;

  --zz-text:           #1D1B18;
  --zz-text-muted:     #5A554C;
  --zz-text-disabled:  #A09A90;

  --zz-accent:         #2E7D32;
  --zz-accent-hover:   #276C2B;
  --zz-accent-active:  #1F5A23;
  --zz-on-accent:      #FFFFFF;
  --zz-accent-text:    #2B6E2E;
  --zz-accent-subtle:  #E3F1DF;

  --zz-danger:         #C62828;
  --zz-on-danger:      #FFFFFF;
  --zz-danger-text:    #B3261E;
  --zz-danger-subtle:  #FBE4E2;

  --zz-warning:        #F2B84B;
  --zz-on-warning:     #1F1600;
  --zz-warning-text:   #8A5A00;
  --zz-warning-subtle: #FCEFD2;

  --zz-info-text:      #1F5FA8;
  --zz-info-subtle:    #E1ECF8;

  --zz-focus:          #1A5FD6;
  --zz-scrim:          rgb(20 18 15 / 0.45);
}
```

Rules
- Body: `background: var(--zz-bg); color: var(--zz-text);`.
- Green text is always `--zz-accent-text`, never `--zz-accent` (in the light theme the fill is darker than needed for text
  on surface-3; in the dark theme the fill is reserved for buttons).
- Status colours (danger/warning/info/success) are never the only signal: always pair with an icon and words.

### 2.2 Board tokens (theme-independent)

The board does not change with the app theme. Two board designs (setting "Brettdesign"); **Moos** is the default.
Holz is optional and only built if the settings package covers "Brett- und Figurendesign".

```css
:root {
  /* Moos (default) */
  --zz-sq-light:          #EEF0D6;
  --zz-sq-dark:           #5B7E43;
  --zz-coord-on-light:    #46633A;  /* coordinate text drawn on light squares */
  --zz-coord-on-dark:     #FFFFFF;  /* coordinate text drawn on dark squares */
}
:root[data-board="holz"] {
  --zz-sq-light:          #EDD6B0;
  --zz-sq-dark:           #946844;
  --zz-coord-on-light:    #6E4826;
  --zz-coord-on-dark:     #FFFFFF;
}
:root {
  /* square overlays (painted over the square colour) */
  --zz-hl-lastmove:       rgb(244 210 60 / 0.50);  /* from- and to-square of the last move */
  --zz-hl-selected:       rgb(244 210 60 / 0.70);  /* selected piece (click-to-move) */
  --zz-hl-correct:        rgb(124 191 74 / 0.55);  /* correct move in puzzle/lesson */
  --zz-hl-wrong:          rgb(215 50 43 / 0.50);   /* wrong move in puzzle/lesson */
  --zz-hl-hint-fill:      rgb(37 99 235 / 0.22);   /* hint stage 1 and 2 square fill */
  --zz-hl-check:          radial-gradient(circle, #FF3B30 0%, rgb(255 59 48 / 0.75) 30%, rgb(255 59 48 / 0) 72%);

  /* markers – each has a dark and a light component, so one of them reaches ≥ 3:1 on every square */
  --zz-dot-core:          rgb(14 18 11 / 0.55);    /* legal-move dot */
  --zz-dot-ring:          rgb(255 255 255 / 0.90); /* 2 px ring around the dot */
  --zz-hint-ring-dark:    #0A3D9C;                 /* 4 px inset ring */
  --zz-hint-ring-light:   #FFFFFF;                 /* next 2 px inset ring */
  --zz-board-focus-dark:  #111111;                 /* 3 px inset keyboard cursor */
  --zz-board-focus-light: #FFFFFF;                 /* next 2 px inset */

  /* user marks (right click) and arrows */
  --zz-mark-red:          rgb(235 64 52 / 0.75);   /* right click */
  --zz-mark-green:        rgb(96 168 56 / 0.75);   /* Shift + right click */
  --zz-mark-blue:         rgb(52 120 220 / 0.75);  /* Alt + right click */
  --zz-mark-yellow:       rgb(240 190 40 / 0.75);  /* Ctrl/Strg + right click */
  --zz-arrow-user:        rgb(242 163 58 / 0.85);  /* right-drag arrow, default orange */
  --zz-arrow-best:        rgb(124 191 74 / 0.90);  /* "besserer Zug" in analysis, engine line */
  --zz-arrow-hint:        rgb(47 107 255 / 0.85);  /* lesson/demo arrows, hint stage 2 (Einfache Ansicht) */
  --zz-arrow-threat:      rgb(232 85 58 / 0.85);   /* Coach: opponent threat, checking piece */

  /* evaluation bar and graph */
  --zz-eval-white:        #F0EEE9;
  --zz-eval-black:        #3A3733;
}
```

Arrow shapes (all colours): shaft width 16 % of square size, head 2.2 × shaft width, start at square centre,
end 30 % of a square before the target centre; semi-transparent as specified so pieces stay visible.
Shift/Alt/Ctrl modify arrows the same way as square marks.

### 2.3 Move classification (PRD "Zugklassifizierung")

Colours follow the PRD rule (Brillant/Großartig blue-teal, Bester/Exzellent green, Ungenauigkeit yellow, Fehler orange,
Patzer red). Every category has a **unique symbol**, so the classification is readable without colour (colour-blind
users, monochrome screenshots). Icons from `lucide-react` (ISC licence; see 11).

| Key (code) | Label (UI) | Symbol in badge | Fill token / value | Ink (symbol colour) | Ink:fill |
| --- | --- | --- | --- | --- | --- |
| `brilliant` | Brillant | text `!!` | `--zz-cls-brilliant` #1FB5A9 | #141414 | 7.23 |
| `great` | Großartig | text `!` | `--zz-cls-great` #4F86D9 | #141414 | 5.04 |
| `best` | Bester Zug | icon `Star` (filled) | `--zz-cls-best` #6FAE45 | #141414 | 6.86 |
| `excellent` | Exzellent | icon `ThumbsUp` | `--zz-cls-excellent` #93C15A | #141414 | 8.79 |
| `good` | Gut | icon `Check` | `--zz-cls-good` #93A88A | #141414 | 7.20 |
| `book` | Buchzug | icon `BookOpen` | `--zz-cls-book` #B38C61 | #141414 | 6.00 |
| `inaccuracy` | Ungenauigkeit | text `?!` | `--zz-cls-inaccuracy` #F2C232 | #141414 | 11.00 |
| `mistake` | Fehler | text `?` | `--zz-cls-mistake` #F5933B | #141414 | 8.00 |
| `miss` | Verpasst | icon `X` | `--zz-cls-miss` #EE6B5B | #141414 | 6.04 |
| `blunder` | Patzer | text `??` | `--zz-cls-blunder` #D7322B | #FFFFFF | 4.79 |

```css
:root {
  --zz-cls-brilliant:  #1FB5A9;  --zz-cls-brilliant-ink:  #141414;
  --zz-cls-great:      #4F86D9;  --zz-cls-great-ink:      #141414;
  --zz-cls-best:       #6FAE45;  --zz-cls-best-ink:       #141414;
  --zz-cls-excellent:  #93C15A;  --zz-cls-excellent-ink:  #141414;
  --zz-cls-good:       #93A88A;  --zz-cls-good-ink:       #141414;
  --zz-cls-book:       #B38C61;  --zz-cls-book-ink:       #141414;
  --zz-cls-inaccuracy: #F2C232;  --zz-cls-inaccuracy-ink: #141414;
  --zz-cls-mistake:    #F5933B;  --zz-cls-mistake-ink:    #141414;
  --zz-cls-miss:       #EE6B5B;  --zz-cls-miss-ink:       #141414;
  --zz-cls-blunder:    #D7322B;  --zz-cls-blunder-ink:    #FFFFFF;
}
```

Usage rules
- One source of truth in code: a `CLASSIFICATION_META` record `{ key, label, symbol | icon, fillVar, inkVar, plain }`
  (`plain` = the plain-language line for Einfache Ansicht, see 8.7). Badge, move list, summary, graph and tests read it.
- Category labels are always written in `--zz-text`, next to the badge. Never colour text with a category colour.
- Badge on the board: on the **destination square** of the move, see 4.5.
- Badge in lists: 18 px circle (20 px in Einfache Ansicht), symbol 11 px bold / icon 12 px, 1 px ring
  `rgb(0 0 0 / 0.25)` in the light theme (yellow/green fills are pale on white).
- `aria-label` of a badge = the label ("Patzer"). Symbols are `aria-hidden`.

### 2.4 Computed contrast ratios (WCAG 2.2 relative-luminance formula)

All values computed from the hex tokens above (script logic: sRGB → linear → L = 0.2126 R + 0.7152 G + 0.0722 B,
ratio = (L1 + 0.05)/(L2 + 0.05)). Coders add a unit test `tokens.contrast.test.ts` that parses `tokens.css`,
recomputes these pairs and fails below the target (4.5 for text, 3.0 for non-text).

**Text tokens on every surface (target ≥ 4.5:1)**

| Text token | Theme | on bg | on surface | on surface-2 | on surface-3 |
| --- | --- | --- | --- | --- | --- |
| `--zz-text` | dark | 16.02 | 14.40 | 12.69 | 10.81 |
| `--zz-text` | light | 15.50 | 17.18 | 14.71 | 13.18 |
| `--zz-text-muted` | dark | 7.39 | 6.64 | 5.85 | 4.98 |
| `--zz-text-muted` | light | 6.68 | 7.40 | 6.33 | 5.67 |
| `--zz-accent-text` | dark | 9.36 | 8.41 | 7.41 | 6.31 |
| `--zz-accent-text` | light | 5.62 | 6.23 | 5.33 | 4.77 |
| `--zz-danger-text` | dark | 7.16 | 6.44 | 5.67 | 4.83 |
| `--zz-danger-text` | light | 5.90 | 6.54 | 5.59 | 5.01 |
| `--zz-warning-text` | dark | 10.10 | 9.08 | 8.00 | 6.81 |
| `--zz-warning-text` | light | 5.35 | 5.93 | 5.07 | 4.55 |
| `--zz-info-text` | dark | 8.46 | 7.60 | 6.70 | 5.70 |
| `--zz-info-text` | light | 5.81 | 6.44 | 5.51 | 4.94 |
| `--zz-text-disabled` | dark | 3.95 | 3.55 | 3.13 | 2.67 |
| `--zz-text-disabled` | light | 2.52 | 2.79 | 2.39 | 2.14 |

`--zz-text-disabled` is only for disabled controls (exempt under WCAG 1.4.3). Everything a learner must read uses
`--zz-text` or `--zz-text-muted`.

**Fills, tinted backgrounds and non-text (text target 4.5, non-text target 3.0)**

| Pair | dark | light |
| --- | --- | --- |
| on-accent on accent (primary button) | 8.03 | 5.13 |
| on-accent on accent-hover | 9.23 | 6.43 |
| on-accent on accent-active | 6.56 | 8.25 |
| on-danger on danger | 4.66 | 5.62 |
| on-warning on warning | 10.00 | 10.00 |
| text on accent-subtle | 12.09 | 14.66 |
| accent-text on accent-subtle | 7.06 | 5.31 |
| text on danger-subtle | 13.43 | 14.15 |
| danger-text on danger-subtle | 6.00 | 5.38 |
| text on warning-subtle | 11.77 | 15.07 |
| warning-text on warning-subtle | 7.42 | 5.20 |
| muted on warning-subtle | 5.43 | 6.49 |
| text on info-subtle | 12.94 | 14.36 |
| info-text on info-subtle | 6.83 | 5.38 |
| muted on info-subtle | 5.97 | 6.18 |
| focus ring vs bg (non-text) | 8.94 | 5.19 |
| focus ring vs surface | 8.03 | 5.75 |
| focus ring vs surface-2 | 7.08 | 4.92 |
| focus ring vs surface-3 | 6.03 | 4.41 |
| border-strong vs bg (input outline) | 3.90 | 3.39 |
| border-strong vs surface | 3.50 | 3.75 |
| border-strong vs surface-2 | 3.09 | 3.21 |
| accent fill vs bg (active nav, progress) | 8.10 | 4.63 |
| accent fill vs surface | 7.28 | 5.13 |
| accent fill vs surface-3 (progress track) | 5.46 | 3.93 |

**Board (Moos / Holz)**

| Pair | Moos | Holz | Note |
| --- | --- | --- | --- |
| light square vs dark square | 4.01 | 3.43 | stronger than usual, helps beginners name squares |
| coordinate on light square (12 px semibold) | 5.82 | 5.67 | text ≥ 4.5 |
| coordinate on dark square | 4.66 | 4.86 | text ≥ 4.5 |
| legal-move dot, best of core/ring – light square | 4.00 | 3.80 | ≥ 3.0 |
| … dark square | 4.12 | 4.28 | ≥ 3.0 |
| … light square with last-move highlight | 3.87 | 3.76 | ≥ 3.0 |
| … dark square with last-move highlight | 3.06 | 3.05 | ≥ 3.0 |
| hint ring, best of dark/light ring – light / dark square | 8.36 / 4.66 | 6.87 / 4.86 | ≥ 3.0 |
| keyboard cursor #111111 – light / dark square | 16.25 / 4.06 | 13.35 / 3.89 | ≥ 3.0 |
| eval bar white vs black part; label | 10.21 | 10.21 | |
| badge ink vs fill | 4.79 – 11.00 | | see 2.3 |

Two board cues are **redundant by design** and do not need 3:1: the last-move highlight (1.14 on Moos light squares;
the move is also shown in the move list and announced to screen readers) and the check glow (also shown as text
"Schach", played as sound, announced via `aria-live`, and in Einfache Ansicht drawn as a threat arrow).

### 2.5 Typography

Font: **Inter Variable**, self-hosted via npm `@fontsource-variable/inter` (OFL-1.1; works offline in the PWA).
Fallback stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
Numbers that change or align (ratings, clocks, move list, percentages, counters) use `font-variant-numeric: tabular-nums`
(Tailwind `tabular-nums`). Weights: 400, 500, 600, 700 only.

| Token | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `display` | 36 / 40 px (phone 32 / 36) | 700 | big numbers: rating on dashboard, accuracy, Rush score |
| `h1` | 28 / 34 px (phone 24 / 30) | 600 | page title |
| `h2` | 22 / 28 px (phone 20 / 26) | 600 | section title |
| `h3` | 18 / 24 px | 600 | card title, panel title |
| `body-lg` | 18 / 28 px | 400 | lesson text on desktop; all body text in Einfache Ansicht |
| `body` | 16 / 24 px | 400 | default text, coach bubble, explanations |
| `body-sm` | 14 / 20 px | 400/500 | meta, secondary lines, chips |
| `move` | 15 / 22 px | 500 (current 600) | move list, tabular |
| `caption` | 12 / 16 px | 500 | tab bar labels, badges, board coordinates (600) |

Rules: nothing below 12 px; anything the learner must read to act ≥ 14 px; explanations and lesson text ≥ 16 px.
Max line length 68 ch for text blocks. Sentence case everywhere; no ALL CAPS.

### 2.6 Spacing, sizes, breakpoints

Spacing uses the Tailwind 4 px scale. Allowed steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

| Token | Value |
| --- | --- |
| Page gutter | 16 px (< 768), 24 px (768–1279), 32 px (≥ 1280) |
| Card padding | 16 px (< 768), 20 px (≥ 768) |
| Gap between cards | 12 px (< 768), 16 px (≥ 768) |
| Stack gap inside a card | 8 px (tight), 12 px (default), 16 px (sections) |
| `--zz-sidebar-w` | 224 px (≥ 1280), icon rail 72 px (768–1279) |
| `--zz-panel-w` | 360 px (1024–1279), 400 px (1280–1535), 440 px (≥ 1536) |
| `--zz-topbar-h` | 44 px (phone board screens), 56 px (phone non-board screens); none on desktop |
| `--zz-tabbar-h` | 56 px + `env(safe-area-inset-bottom)` |
| `--zz-actionbar-h` | 64 px + `env(safe-area-inset-bottom)` (phone board screens) |
| `--zz-player-bar-h` | 44 px (desktop), 36 px (phone) |
| `--zz-eval-w` | 24 px vertical bar (≥ 768); 8 px horizontal bar (< 768) |
| Content max width (non-board pages) | 1120 px, centred |
| Min touch target | 44 × 44 px |

Breakpoints (Tailwind defaults): `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536. The app works from 360 to 2560 px
(P0-16); above 1920 px content stays centred with max width, the board is capped at 960 px.

### 2.7 Radii

| Token | Value | Use |
| --- | --- | --- |
| `--zz-radius-sm` | 6 px | chips, tags, rating delta, small inputs |
| `--zz-radius-md` | 10 px | buttons, inputs, segmented control, toast |
| `--zz-radius-lg` | 14 px | cards, panel, coach bubble |
| `--zz-radius-xl` | 20 px | dialogs, bottom sheets (top corners only) |
| `--zz-radius-board` | 4 px | board outer corners |
| full | 9999 px | avatars, badges, dots, pills |

### 2.8 Shadows (elevation)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--zz-shadow-1` | `0 1px 2px rgb(0 0 0 / 0.40)` | `0 1px 2px rgb(30 25 15 / 0.08)` | cards (with 1 px `--zz-border`) |
| `--zz-shadow-2` | `0 6px 16px rgb(0 0 0 / 0.45)` | `0 6px 16px rgb(30 25 15 / 0.12)` | popovers, toasts, dragged piece |
| `--zz-shadow-3` | `0 16px 40px rgb(0 0 0 / 0.55)` | `0 16px 40px rgb(30 25 15 / 0.18)` | dialogs, sheets |
| `--zz-shadow-board` | `0 8px 24px rgb(0 0 0 / 0.45)` | `0 6px 18px rgb(30 25 15 / 0.18)` | board |
| `--zz-shadow-button` | `inset 0 -3px 0 rgb(0 0 0 / 0.22)` | same | primary/secondary `lg` buttons (tactile "game" feel) |

In the dark theme elevation is mainly expressed by lighter surfaces (surface → surface-2 → surface-3); shadows support it.

### 2.9 Motion tokens and z-index

| Token | Value |
| --- | --- |
| `--zz-dur-fast` | 100 ms (hover, press, colour changes) |
| `--zz-dur-base` | 150 ms (piece move, toggles, badge pop) |
| `--zz-dur-slow` | 200 ms (sheets, panels, eval bar, toasts) – **maximum for any transition** |
| `--zz-ease-out` | `cubic-bezier(0.2, 0, 0, 1)` (enter, piece moves) |
| `--zz-ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` (state changes) |

z-index: board overlays 10 · sticky bars 20 · sidebar/tab bar 30 · banners 40 · popovers/menus 50 · dialogs/sheets 60 ·
toasts 70.

### 2.10 Tailwind mapping

Tailwind CSS v4 (CSS-first config) is assumed. In the main stylesheet:

```css
@import "tailwindcss";
@import "./tokens.css";

@custom-variant light (&:where([data-theme=light], [data-theme=light] *));

@theme inline {
  --color-*: initial;                 /* disable the default palette: tokens only */
  --color-white: #FFFFFF; --color-black: #000000; --color-transparent: transparent; --color-current: currentColor;
  --color-bg: var(--zz-bg);
  --color-surface: var(--zz-surface);
  --color-surface-2: var(--zz-surface-2);
  --color-surface-3: var(--zz-surface-3);
  --color-border: var(--zz-border);
  --color-border-strong: var(--zz-border-strong);
  --color-text: var(--zz-text);
  --color-muted: var(--zz-text-muted);
  --color-disabled: var(--zz-text-disabled);
  --color-accent: var(--zz-accent);
  --color-accent-hover: var(--zz-accent-hover);
  --color-accent-active: var(--zz-accent-active);
  --color-on-accent: var(--zz-on-accent);
  --color-accent-text: var(--zz-accent-text);
  --color-accent-subtle: var(--zz-accent-subtle);
  --color-danger: var(--zz-danger);
  --color-on-danger: var(--zz-on-danger);
  --color-danger-text: var(--zz-danger-text);
  --color-danger-subtle: var(--zz-danger-subtle);
  --color-warning: var(--zz-warning);
  --color-on-warning: var(--zz-on-warning);
  --color-warning-text: var(--zz-warning-text);
  --color-warning-subtle: var(--zz-warning-subtle);
  --color-info-text: var(--zz-info-text);
  --color-info-subtle: var(--zz-info-subtle);
  --color-focus: var(--zz-focus);
  /* classification: --color-cls-blunder etc. map the same way */

  --font-sans: "Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-xl: 20px;
  --shadow-1: var(--zz-shadow-1); --shadow-2: var(--zz-shadow-2); --shadow-3: var(--zz-shadow-3);
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
}
```

Then components write `bg-surface text-text`, `text-muted`, `bg-accent text-on-accent`, `rounded-lg`, `shadow-2`.
If the foundation picks Tailwind v3 instead, define the same names in `theme.extend.colors` as `var(--zz-…)`; the token
names and values do not change.

---

## 3. Layout

### 3.1 App shell

| Width | Navigation | Board screens |
| --- | --- | --- |
| 360–767 px (phone) | bottom tab bar (6 tabs); hidden on active board screens, replaced by the action bar | board full width on top, panel below, fixed action bar at the bottom |
| 768–1023 px (tablet) | left icon rail 72 px (icon + 12 px label) | board centred on top (max `min(100%, 100dvh − 220px)`), panel below |
| ≥ 1024 px (desktop) | rail 72 px (1024–1279) or sidebar 224 px with labels (≥ 1280) | eval bar + board + panel side by side |
| landscape phone (height < 500 px, width > height) | tab bar hidden on board screens | board left (`100dvh − 16px`), panel right, actions at the panel bottom |

The sidebar/rail is always visible on ≥ 768 px, also on board screens ("Jeder Bereich ist von überall mit einem Klick
erreichbar"). Sidebar footer: sync status (3.7/5.10), "Einstellungen" (gear) and the profile avatar.

### 3.2 The six navigation areas

| # | Label (sidebar + tab bar) | lucide icon | Route | Contains | PRD |
| --- | --- | --- | --- | --- | --- |
| 1 | Start | `House` | `/` | Dashboard: Tagesziel, Streak, "Weiter, wo du aufgehört hast", nächste Lektion, Ratings | P0-14 |
| 2 | Puzzles | `Puzzle` | `/puzzles` | Bewertet, Lernmodus, Themen-Training (later Tagespuzzle, Wiederholung, Rush) | P0-04/05/06 |
| 3 | Spielen | `Swords` | `/play` | Bot-Liste, Hilfe-Stufe, Partie fortsetzen, Aus Stellung spielen | P0-07/08/09 |
| 4 | Lernen | `GraduationCap` | `/learn` | Lernpfad → Stufe → Kurs → Lektion | P0-12/13 |
| 5 | Analyse | `ChartLine` | `/analysis`, `/analysis/:gameId` | Analysierte Partien, PGN-Import, Analysebrett | P0-10/11/15, P2 deep link |
| 6 | Profil | `CircleUser` | `/profile`, `/settings` | Ratings, Verlauf, Schwächen, Konto (Export/Löschen), Einstellungen | module 5/6, DoD |

"Lernen" is used instead of "Lektionen" because 6 tabs must fit 360 px (60 px per tab); the page title is "Lernpfad".
Active item: icon + label in `--zz-accent-text`, a 3 px accent bar (left edge in sidebar, top edge in tab bar), and
`aria-current="page"`. Inactive: `--zz-text-muted`. Tab bar labels are always visible (no icon-only tabs).

### 3.3 Board screen – desktop (≥ 1024 px)

```
┌─────────┬────────────────────────────────────────────────────┬──────────────────────────┐
│ Sidebar │  ┌──┐ ┌ Gegner-Leiste 44 px ───────────────────┐   │ Panel (--zz-panel-w)     │
│ 224 /72 │  │E │ │                                        │   │ ┌ Reiter ──────────────┐ │
│         │  │v │ │                                        │   │ │ Coach | Züge | …      │ │
│ Start   │  │a │ │        Brett (Quadrat,                 │   │ ├──────────────────────┤ │
│ Puzzles │  │l │ │        --zz-board-size)                │   │ │ Inhalt (scrollt)      │ │
│ Spielen │  │  │ │                                        │   │ │                       │ │
│ Lernen  │  │24│ │                                        │   │ ├──────────────────────┤ │
│ Analyse │  └──┘ └ Eigene Leiste 44 px ───────────────────┘   │ │ Aktionsleiste (fest)  │ │
│ Profil  │                                                    │ └──────────────────────┘ │
└─────────┴────────────────────────────────────────────────────┴──────────────────────────┘
```

- Board size: `min(100dvh − 2 × player-bar − 48px, 100vw − nav-w − panel-w − eval-w − 96px, 960px)`, minimum 320 px,
  **rounded down to a multiple of 8 px** (no sub-pixel seams between squares). Measured with a ResizeObserver and
  passed to react-chessboard.
- The panel has the same height as the board column (top of the opponent bar to the bottom of the own bar), aligned
  to it; its content scrolls, its action area does not.
- Gap board ↔ panel 24 px; eval bar ↔ board 12 px. The whole group is centred horizontally in the main area.
- Puzzle and lesson screens have no player bars: the board grows by 88 px instead. The task status ("Weiß am Zug")
  is the panel header on desktop and the top-bar title on phone (no extra status line above the board).

### 3.4 Board screen – phone (360–430 px)

```
┌──────────────────────────────┐  44  Top bar: ‹ Zurück · Titel · ⋮ (Brett drehen, Töne, Einstellungen)
│ Gegner-Leiste                │  36  (Partie/Analyse only)
├──────────────────────────────┤   8  Eval bar, horizontal (Training/Coach/Analyse only)
│                              │
│      Brett 100vw × 100vw     │ 360–430  square = 45–53 px ≥ 44 px touch target
│                              │
├──────────────────────────────┤
│ Eigene Leiste                │  36
├──────────────────────────────┤
│ Panel (scrollt intern):      │ rest   coach bubble first, then move strip / step text
│ Coach-Blase · Zugleiste      │
├──────────────────────────────┤
│ Aktionsleiste (fest)         │  64 + safe area: max 1 primary + 3 icon buttons
└──────────────────────────────┘
```

- Board edge to edge (no side gutter) – PRD "Brett in voller Breite". Everything else keeps the 16 px gutter.
- Vertical budget at 360 × 640: 44 + 36 + 8 + 360 + 36 + 64 = 548 px → 92 px panel peek on game screens,
  172 px on puzzle screens (no player bars, no eval bar). If the panel peek is < 120 px, the panel shows only the newest
  coach sentence (2 lines, ellipsis) plus "Mehr" which opens the full panel as a bottom sheet (Radix Dialog, 85 dvh).
- The page itself does not scroll on board screens at heights ≥ 600 px (board must stay in view while the learner reads);
  below 600 px the page may scroll and the board scrolls with it.
- The eval bar is horizontal on phones (White's portion on the left when White is at the bottom, on the right when
  the board is flipped) so the board keeps the full width and ≥ 45 px squares.
- On non-board screens the tab bar is shown; on active board screens (a running puzzle, game, lesson, analysis) the tab
  bar is replaced by the action bar and the top bar's "‹" leads back to the area's hub. Leaving never loses progress
  (P0-09, P0-12), so no confirmation dialog except for rated puzzles in progress: "Puzzle verlassen? Es zählt dann als
  nicht gelöst." [Verlassen] [Weiterlösen].

### 3.5 Panel content per board screen

| Screen | Panel header | Tabs | Content | Action bar (phone) / panel footer (desktop) |
| --- | --- | --- | --- | --- |
| Bewertetes Puzzle | side to move ("Weiß am Zug"), puzzle rating hidden until solved, own rating chip | none | task line, feedback, after the end: motif tags + explanation | Hinweis (with rated warning) · Brett drehen · primary "Nächstes Puzzle" after the end |
| Lernmodus / Themen | same + motif name in Themen-Training | none | task, hint text per stage, explanation | Hinweis 1/3 → 2/3 → Lösung zeigen · primary "Nächstes Puzzle" |
| Partie (Wettkampf) | bot name + Elo, Hilfe-Stufe chip | Züge | move list | Aufgeben · Brett drehen · (Remis beanspruchen when available) |
| Partie (Training/Coach) | same | **Coach** (default) · Züge | coach bubbles (latest on top), threat notes | Zurücknehmen · Hinweis · Brett drehen · Remis beanspruchen / Aufgeben in ⋮ |
| Analyse | game title, result, date | **Analyse** (summary) · Züge | summary: accuracy, category counts, eval graph, 3–5 key moments; Züge: list + explanation of the current move | ⏮ ◀ ▶ ⏭ · primary "Nochmal versuchen" on a mistake/blunder |
| Lektion | course › lesson, step progress "Schritt 3 von 8" | none | step text / quiz options / demo comment | ◀ (previous step) · Hinweis (Finde den Zug) · primary "Weiter" |
| Analysebrett | "Analysebrett" | Engine · Züge | engine lines (top 2), FEN/PGN load/export | ⏮ ◀ ▶ ⏭ · Brett drehen · Stellung aufbauen |

Tabs are Radix Tabs; the active tab persists per screen type in localStorage (convenience only, try/catch).

### 3.6 Non-board screens

**Start (Dashboard, P0-14)** – one column on phone, 12-column grid on desktop (8 + 4).
1. Header row: "Hallo {Name}" (h1) · streak badge · (phone) daily-goal ring 40 px.
2. Hero card "Weiter, wo du aufgehört hast" – largest card, board thumbnail 96 px (phone 72 px), title, one meta line,
   primary button (lg). Only one hero. If nothing is in progress: "Dein erster Schritt" pointing to the next lesson.
3. Tagesziel card – progress ring 72 px, "12 von 20 Min.", one line what counts.
4. Nächste Lektion card – course, lesson title, stars so far, secondary button "Lektion starten".
5. Ratings row – two stat tiles: Puzzle-Rating, Bot-Rating ("Noch kein Bot-Rating – spiel eine Wettkampf-Partie").
6. "Als Nächstes trainieren" card only when the weakness data exists (module 5); otherwise omitted (no empty card).

**Puzzles hub** – mode cards (Bewertet with rating, Lernmodus, Themen-Training) as 3 large cards; Themen-Training opens
a grid of ≥ 20 motif chips/cards with success rate ("62 % gelöst") and a segmented difficulty filter
(Leicht · Mittel · Schwer).

**Spielen** – "Partie fortsetzen" card on top if a game is running; bot grid grouped by strength ("Zum Einstieg
(bis 800)", "Mittel (800–1600)", "Stark (ab 1600)"); bot card: avatar 64, name, Elo, style chip, one chat line.
Setup sheet after choosing a bot: Hilfe-Stufe (segmented, with one-line description each; preselected: Coach in
Einfache Ansicht, otherwise the last used), Farbe (Weiß · Zufall · Schwarz), primary "Partie starten". Bedenkzeit is not shown in V1 (clocks are P1-06) – games are "ohne Uhr".

**Lernen (Lernpfad)** – vertical path: Stufe sections (h2 + Elo range), course cards with a progress bar and
"3 von 6 Lektionen", lessons as rows (number, title, 0–3 stars, state: erledigt / aktuell / gesperrt). The current lesson
row is highlighted with `--zz-surface-3` and a "Weiter" button. Locked lessons show a lock icon and stay readable
(muted text, not disabled-grey).

**Analyse** – primary "PGN einfügen oder hochladen", secondary "Analysebrett"; list of games (opponent, result,
date, accuracy, number of Patzer). Empty state in 5.11.

**Profil** – ratings with history chart, weaknesses (motif success rates), account (Export, Konto löschen – danger),
link to Einstellungen. **Einstellungen**: Design (Dunkel/Hell), Brettdesign, Koordinaten anzeigen, Mögliche Züge
anzeigen, Töne, Animationen, Zugbestätigung, Notation (Deutsch K D T L S / Englisch K Q R B N), Einfache Ansicht,
Tagesziel (Minuten). Each setting is a row with label, one-line description, control on the right (switch or select).

### 3.7 Sync status placement (P0-02)

| State | Desktop | Phone non-board | Phone board screen |
| --- | --- | --- | --- |
| Gespeichert (idle) | sidebar footer: cloud icon + "Gespeichert" (muted) | nothing | nothing |
| Speichern … (> 1 s) | sidebar footer: spinner + "Speichern …" | nothing | nothing |
| Offline | banner on top of main content (warning-subtle) | banner under the top bar | pill in the top bar ("Offline") – tap shows the banner text as a sheet |
| Nicht synchronisiert (retrying) | sidebar footer in warning-text + banner | banner | pill "Nicht synchronisiert" |
| Lokaler Modus (no Supabase env) | banner once per session (info-subtle, dismissible) + footer label "Lokal" | banner once per session | nothing |
| Partie läuft auf anderem Gerät | dialog (decision needed) | dialog | dialog |

Board screens never get a banner that pushes the board down while playing.

---

## 4. Board presentation

### 4.1 Pieces and squares
- Use react-chessboard's bundled default piece set (licence checked by the foundation). No chess.com piece sets.
- Board corners `--zz-radius-board`, shadow `--zz-shadow-board`, no border.
- Orientation: the learner's colour at the bottom. "Brett drehen" (icon `ArrowDownUp`, key `F`) flips board, eval bar,
  player bars and coordinates together.

### 4.2 Coordinates
- Inside the board (files on the bottom rank, ranks on the left file), 12 px / 600 (14 px in Einfache Ansicht),
  4 px from the square edge, colour by square: `--zz-coord-on-light` / `--zz-coord-on-dark`.
- Default on (setting "Koordinaten anzeigen"). Always on in Einfache Ansicht and in the lesson "Notation".

### 4.3 Moving
- Drag-and-drop and click-to-move both work everywhere (P0-03). Touch: tap piece → tap target is the primary method;
  drag also works. While dragging, the piece is scaled 1.1× with `--zz-shadow-2`.
- Selecting a piece: `--zz-hl-selected` on its square + legal-move dots on all legal targets (from chess.js).
- Legal-move dot: centred circle, diameter 26 % of the square (34 % in Einfache Ansicht), fill `--zz-dot-core`,
  2 px ring `--zz-dot-ring`. Capture target: ring touching the square edge, thickness 9 % of the square, colour
  `--zz-dot-core`, with a 1.5 px `--zz-dot-ring` line on its inner edge.
- "Mögliche Züge anzeigen" (default on) toggles the dots; Einfache Ansicht forces them on.
- Illegal drop: the piece returns (150 ms), no error sound, no message (the dots already show what is possible).
  In Einfache Ansicht, the second illegal drop of the same piece within 10 s shows one coach line:
  "Diese Figur kann dort nicht hinziehen. Die Punkte zeigen dir, wohin sie darf."
- Zugbestätigung (setting, default off): after the drop the piece shows on the target at 60 % opacity; the action bar
  shows "Zug bestätigen" (primary) and "Abbrechen".

### 4.4 Highlights and markers
- Last move: `--zz-hl-lastmove` on from- and to-square.
- Check: `--zz-hl-check` on the king's square (under the piece) + status text "Schach" + sound + live announcement.
- Hint stage 1 (piece): `--zz-hl-hint-fill` + inset rings `inset 0 0 0 4px var(--zz-hint-ring-dark), inset 0 0 0 6px var(--zz-hint-ring-light)`.
- Hint stage 2 (target square): same style on the target square; in Einfache Ansicht additionally a `--zz-arrow-hint` arrow.
- Correct move: `--zz-hl-correct` on the destination + check badge (theme-independent: fill #7CBF4A, `Check` icon in
  #0F1A07, 8.03:1).
- Wrong move: `--zz-hl-wrong` on the destination + `X` badge (#D7322B, white ink) for 700 ms, then the move is undone.
- Right-click marks and right-drag arrows (desktop, P0-03): colours in 2.2; right-click on a marked square removes the
  mark; left click anywhere on the board clears all user marks. Not available on touch (no long-press menus in V1).
- Keyboard cursor (see 7.4): `inset 0 0 0 3px var(--zz-board-focus-dark), inset 0 0 0 5px var(--zz-board-focus-light)`.

### 4.5 Classification badge on the board (analysis, coach praise)
- Circle, diameter 38 % of the square (min 18 px, max 30 px), placed at the **top-right corner of the destination
  square**, centre offset 30 % of the badge outward – but clamped inside the board on the h-file/8th rank (or the
  mirrored edge when flipped).
- 2 px white ring, `0 1px 3px rgb(0 0 0 / 0.45)` shadow, fill and ink from 2.3. Pops in with scale 0.6 → 1 in 150 ms.
- Only the badge of the **current** move is shown on the board.

### 4.6 Promotion (FIDE: compulsory, own colour, queen/rook/bishop/knight)
- When a pawn reaches the last rank, a picker opens on the promotion file: four pieces stacked from the promotion
  square towards the centre (Dame, Turm, Läufer, Springer), each a full square, on `--zz-surface` with `--zz-shadow-3`,
  the rest of the board dimmed with `--zz-scrim`.
- Each option is a button with `aria-label` "Dame", "Turm", "Läufer", "Springer"; Dame has initial focus; `Esc` or a
  click outside cancels and returns the pawn. All four are always offered (no auto-queen default) – the
  under-promotion choice is part of the rules learners must see.

### 4.7 Player bars (games and analysis)
- 44 px (phone 36 px): avatar 32 px (phone 28 px), name (600) + Elo (muted, tabular), captured pieces as small
  glyph row (16 px) with material difference "+2"; right side reserved for the clock (P1-06, not in V1).
- Bot thinking: the bot's bar shows "{Name} überlegt …" with three dots (opacity steps, no movement > 200 ms per step;
  static "…" under reduced motion).

---

## 5. Components

All interactive components: visible focus ring (7.2), min 44 × 44 px hit area on touch (`@media (pointer: coarse)`),
disabled state uses `--zz-text-disabled` and `cursor: not-allowed`, never only reduced opacity on text.

### 5.1 Buttons

| Variant | Fill / text | Hover | Active | Use |
| --- | --- | --- | --- | --- |
| primary | `accent` / `on-accent`, 600 | `accent-hover` | `accent-active`, scale 0.98 | the one main action per view |
| secondary | `surface-3` / `text`, 500 | `color-mix(in srgb, var(--zz-surface-3), var(--zz-text) 6%)` | scale 0.98 | other actions |
| ghost | transparent / `text` | `surface-2` | `surface-3` | toolbars, tertiary |
| danger | `danger` / `on-danger` | `color-mix(in srgb, var(--zz-danger), black 8%)` | scale 0.98 | Aufgeben (confirm), Konto löschen |
| link | none / `accent-text`, underline on hover | | | inline "Mehr erfahren" |

| Size | Height | Padding x | Text | Icon |
| --- | --- | --- | --- | --- |
| sm (pointer: fine only) | 36 px | 12 px | 14 px | 16 px |
| md (default) | 44 px | 16 px | 16 px | 20 px |
| lg | 52 px (56 px in Einfache Ansicht) | 24 px | 18 px / 600 | 22 px |

- `lg` primary and secondary carry `--zz-shadow-button`.
- Icon-only: square 44 × 44 (36 × 36 sm on desktop toolbars with a 44 px hit area via padding), `aria-label` required,
  tooltip on hover/focus (desktop only; tooltips are never the only source of information).
- Loading: spinner replaces the icon, label stays, `aria-busy="true"`, button not clickable.
- Labels are verbs: "Partie starten", "Nächstes Puzzle", "Nochmal versuchen". No "OK".
- In the phone action bar the primary button is full width minus the icon buttons; max 1 primary + 3 icon buttons.

### 5.2 Cards
- `bg-surface`, `rounded-lg`, 1 px `--zz-border`, `shadow-1`, padding 16/20.
- Interactive card: the whole card is one link/button (single tab stop), hover `surface-2`, focus ring around the card;
  inner buttons only if the card is not itself clickable.
- Anatomy: leading visual (icon 24 in a 40 px `surface-2` circle, avatar or board thumbnail) · title (h3) · meta
  (body-sm muted, one line) · optional progress · trailing action.
- Hero card (dashboard): 2 px `--zz-accent` left border, larger visual, primary `lg` button.

### 5.3 Coach bubble with avatar
- Layout: avatar (40 px phone / 48 px desktop, circle) left, bubble right. Name above the bubble (caption, muted).
- Bubble: `surface-2`, `rounded-lg` with the top-left corner 4 px (speech tail effect, no triangle), padding 12 × 16,
  text `body` (body-lg in Einfache Ansicht), max 3 sentences.
- Tone variants: 4 px left border + leading 16 px icon
  - neutral (no border), praise (`accent`, `ThumbsUp`), warning (`warning`, `TriangleAlert`),
    danger (`danger`, `OctagonAlert`) for coach warnings before a blunder.
- "Mehr erfahren" (link button, `aria-expanded`) expands details below (Radix Collapsible, 200 ms height): the engine
  line as clickable move chips (hover/focus previews the position on the board, click plays it in "Variante erkunden").
- Feedback row under every explanation (PRD metric "Nützlichkeit"): "War das hilfreich?" + thumbs up/down icon buttons
  (44 px), pressed state `aria-pressed`, then "Danke!" (muted).
- Coach warning (P0-08, Coach mode, before a move that loses ≥ 0.20 expected points):
  the move is **not played**; the piece stays on its origin square, the target square gets `--zz-hl-wrong` at 50 %,
  the hanging piece/threat is shown with `--zz-arrow-threat`. Bubble (danger variant):
  "Bist du sicher? Dein Läufer auf c4 hängt." + reason sentence. Buttons: primary **"Nochmal überlegen"**
  (`Esc`), secondary "Trotzdem ziehen". The bubble is `role="alert"`; focus moves to "Nochmal überlegen".
- New coach messages are announced via an `aria-live="polite"` region (warnings: `assertive`).
- Avatars: our own SVG illustrations (one per bot + one coach). Fallback: monogram (first letter, 600) on a bot colour.
  No chess.com bot names, likenesses or images.

### 5.4 Evaluation bar
- Desktop/tablet: vertical, 24 px wide, height = board; phone: horizontal 8 px, width = board.
- Two parts: `--zz-eval-white` and `--zz-eval-black`, 1 px outline `rgb(255 255 255 / 0.12)` (dark theme) /
  `rgb(0 0 0 / 0.15)` (light). Radius 4 px.
- White share = win percentage W(cp) from the PRD formula, clamped to 3–97 %; forced mate → 100 % / 0 %.
  Side of White follows the board orientation. Height/width transition 200 ms `--zz-ease-out`.
- Label (desktop): 11 px / 700, tabular, inside the leading side's end: "+1,3", "−0,8", "M3" (German decimal comma;
  mate in n as "M{n}"). Phone: label shown in the panel header instead ("Bewertung +1,3").
- Visible in Training and Coach games and in analysis; hidden in Wettkampf, puzzles and lessons.
- Einfache Ansicht: no number; the panel shows words instead (8.7).
- Accessibility: `role="img"` with `aria-label`, e.g. "Bewertung: Weiß steht etwas besser (+1,3)".

### 5.5 Move list
- Desktop: CSS grid, columns `40px 1fr 1fr` (move number muted + "." | White | Black), row height 32 px
  (44 px with `pointer: coarse`), font `move`, tabular.
- Each half-move is a button: hover `surface-2`; current move `surface-3` + weight 600 + `aria-current="step"`.
  Classification badge (18 px) after the move text in analysis. Auto-scroll keeps the current move visible
  (`scrollIntoView({block: "nearest"})`).
- Explored variations ("Variante erkunden") appear indented below the move they branch from, muted, in parentheses.
- Phone: one horizontal strip, 40 px high, chips "12. Sf3 Sc6", current chip `surface-3`; tap jumps; swipe scrolls.
- Navigation row (analysis, lessons with demo): ⏮ ◀ ▶ ⏭ icon buttons 44 px (`ChevronsLeft`, `ChevronLeft`,
  `ChevronRight`, `ChevronsRight`) – labels "Zum Anfang", "Zurück", "Vor", "Zum Ende".
- Notation: German letters by default (K, D, T, L, S; "Sf3", "Dxd8+"), English per setting.
  Symbols `+` and `#` as in SAN. Castling: "0-0" / "0-0-0" (zeros, FIDE Laws Appendix C) in German notation,
  "O-O" / "O-O-O" in English notation; PGN export always uses "O-O" (PGN standard). Rules auditor confirms in RULES.md.
- Semantic: `<ol>` of move pairs; screen reader text of a half-move: "12. Zug Weiß: Springer f3, Bester Zug".

### 5.6 Progress ring and bars
- Ring: SVG, sizes 40 / 72 / 120 px with stroke 4 / 6 / 8 px; track `surface-3`, fill `accent`, round caps; starts at
  12 o'clock, clockwise; transition 200 ms. Centre: "12/20" (tabular, 600) + "Min." (caption muted) at 72/120 px.
  Completed: full ring + `Check` icon in the centre. `role="progressbar"` with `aria-valuenow/min/max` and
  `aria-label` "Tagesziel: 12 von 20 Minuten".
- Linear bar: 6 px high, full radius, track `surface-3`, fill `accent`; determinate with a text label next to it
  ("Analyse läuft … 18 von 40 Zügen", "Engine wird geladen … 60 %").
- Lesson step bar: segmented, one segment per step, 4 px gap; done = `accent`, current = `accent` at 50 %, todo =
  `surface-3`; text "Schritt 3 von 8" next to it (the bar alone is not enough).

### 5.7 Streak badge
- Pill 32 px high, padding 8 × 12, `Flame` icon 16 px + number (600, tabular) + "Tage" (caption).
- States: trained today → `warning-subtle` background, flame in `--zz-warning-text`; not yet today → transparent with
  1 px `border-strong`, flame `text-muted`, tooltip/sub-line "Heute noch offen"; 0 → "Starte heute deinen Streak".
- Never shame: after a break the badge just shows "Tag 1" again; copy "Neuer Anlauf – heute ist Tag 1."
- Milestones 3, 7, 30, 100, 365 days trigger one tier-3 celebration (8.5).

### 5.8 Toast
- Radix Toast. Position: phone bottom-centre, 16 px above the tab/action bar; desktop bottom-right, 24 px inset.
- `surface-3`, `rounded-md`, `shadow-2`, max width 420 px, padding 12 × 16, leading icon by tone, optional single
  action (link button), close icon button.
- One visible at a time (queue). Duration 4 s (info/success), 6 s with an action; swipe or `Esc` dismisses.
- `role="status"` (polite). Toasts are for system events only (saved, exported, copied, PGN imported) –
  **never for learning feedback** (that appears on the board and in the panel).

### 5.9 Banner (sync, offline, local mode)
- Full width of the main content, 40–56 px, padding 8 × 16, background by tone (`warning-subtle`, `danger-subtle`,
  `info-subtle`), icon + one sentence + optional action + optional close. Text `--zz-text`.
- `role="status"`; appear/disappear with a 200 ms height transition (0 ms under reduced motion).
- Copy in 9.3.

### 5.10 Sync status indicator (sidebar footer)
Icon + label, caption size: `Cloud` "Gespeichert" (muted) · spinner "Speichern …" · `CloudOff` "Offline" (warning-text) ·
`RefreshCw` "Nicht synchronisiert" (warning-text) · `HardDrive` "Lokal" (muted). Clicking opens a popover with one
sentence explaining the state and, if pending, "{n} Aktionen warten auf Übertragung".

### 5.11 Empty states
Centered in the content area: 64 px circle (`surface-2`) with a 28 px icon (muted), title (h3), one sentence (muted),
one primary button. Never an empty card or a bare "Keine Daten".

| Where | Title | Sentence | Button |
| --- | --- | --- | --- |
| Analyse, no games | Noch keine Partien | Spiel eine Partie gegen {Bot} ({Elo}) – er passt zu deinem Niveau. Danach siehst du hier deine Analyse. | Partie starten |
| Themen-Training, filter empty | Keine Puzzles für diesen Filter | Wähle eine andere Schwierigkeit oder ein anderes Motiv. | Filter zurücksetzen |
| Profil, no rating history | Noch kein Verlauf | Löse ein paar bewertete Puzzles, dann siehst du hier deine Kurve. | Puzzles lösen |
| Spielen, no running game | (no empty state – the bot list is the content) | | |

### 5.12 Error and loading states
| Situation | Presentation | Copy |
| --- | --- | --- |
| Engine loading | linear bar in the panel, board already usable | "Engine wird geladen … 60 %" |
| Engine failed | inline error card in the panel (`danger-subtle`) | "Die Engine konnte nicht starten. Lade die Seite neu." [Neu laden] |
| Engine slow device | no error; lower depth; small muted label in the analysis header | "Schnellanalyse (geringere Tiefe)" |
| Analysis running (P0-10) | linear bar + count, results fill in progressively | "Analyse läuft … 18 von 40 Zügen" |
| Explanation service down (P0-11) | rule-based explanation shown normally, muted caption under it | "Kurz-Erklärung" |
| PGN invalid (P0-15) | error under the textarea, the line is highlighted in the textarea gutter, focus moves to the error | "Zeile 12: „Sxe9“ ist kein gültiger Zug. Prüfe die Schreibweise und versuch es nochmal." |
| Page/data load failed | inline error with retry, never a blank screen | "Das hat nicht geklappt. Versuch es nochmal." [Erneut versuchen] |
| Loading lists/cards | skeletons in `surface-2` with the final layout's size (opacity pulse 1.2 s; static under reduced motion) | – |

### 5.13 Other primitives (Radix)
- **Dialog** (desktop centred, max 480 px, `rounded-xl`, `shadow-3`, scrim) / **Bottom sheet** (phone, same Radix
  Dialog, slides up 200 ms, drag handle 4 × 36 px, top corners `rounded-xl`). Focus trapped, `Esc` closes.
- **Segmented control** (Hilfe-Stufe, Farbe, difficulty): Radix ToggleGroup single; 44 px; outline `border-strong`;
  selected `accent` fill + `on-accent` text; each option may have a one-line description below the control.
- **Switch** (settings): Radix Switch, 44 × 26 px track, on = `accent`, thumb white.
- **Chip/Tag** (motifs): `surface-2`, `rounded-sm`, 28 px (36 px touch), body-sm 500.
- **Rating delta**: "+8" in `accent-text`; losses "−6" in `text-muted` (not red – a loss is information, not a
  punishment); neutral "±0".
- **Stars** (lessons): 3 × `Star` 24 px (40 px on the completion sheet); earned = filled `--zz-warning` with a 1.5 px
  `--zz-warning-text` stroke; not earned = outline only, 1.5 px `--zz-border-strong` (filled vs outline carries the
  meaning, both ≥ 3:1 against the surface); `aria-label` "2 von 3 Sternen".
- **Quiz option** (lesson quiz): full-width radio card, min 56 px, `surface-2`, 2 px border on focus/selection;
  after answering: correct = `accent-subtle` + `Check`, chosen wrong = `danger-subtle` + `X`, others muted.
- **Eval graph** (analysis summary): width 100 %, height 120 px (phone 96 px); area above/below the 50 % midline filled
  with `--zz-eval-white`/`--zz-eval-black` (win-percentage scale), midline 1 px `border-strong` dashed, markers 8 px dots
  with 2 px white ring in classification colours for Brillant, Großartig, Fehler, Verpasst, Patzer; current move = 2 px
  vertical `accent` line. Click/tap jumps to the move. The graph is `aria-hidden`; the key-moment list carries the same
  information for assistive tech.
- **Key moment card**: move number + move + badge + one-line "why" + "Nochmal versuchen" (primary on the first
  unresolved one, secondary on the others).

---

## 6. Motion and sound

### 6.1 Motion rules
- Every transition ≤ 200 ms (PRD). Piece moves 150 ms (`--zz-ease-out`); bot moves too.
- Allowed: opacity, transform (scale, translate), height of collapsibles, colour. No bouncing, no parallax, no looping
  decorative animation. Spinners and skeleton pulses are the only repeating motion (status indicators).
- Sequences are built from short steps: lesson stars appear one after another (each 150 ms, 100 ms stagger);
  solution playback in puzzles/lessons: 150 ms move + 600 ms pause between moves (pauses are reading time, not animation).
- Setting "Animationen" (default on) and `prefers-reduced-motion: reduce`: all durations 0 ms, piece moves are instant,
  no pops; information is still shown (badges simply appear).

### 6.2 Sound rules
- Five sounds (PRD): **Zug, Schlag, Schach, Erfolg, Fehler**. Mapping: normal move/castling/promotion → Zug; capture
  (incl. en passant) → Schlag; any move that gives check → Schach (replaces Zug/Schlag); puzzle solved, lesson/daily
  goal completed, game won → Erfolg; wrong puzzle/lesson move → Fehler.
- No sound for: illegal drops, coach warnings (visual is enough), rating loss, navigation, toasts.
- Sounds are our own: synthesised with the Web Audio API at runtime or CC0 files. No chess.com sound files.
  Character: Zug = short soft wooden click (≤ 80 ms); Schlag = slightly louder double click; Schach = click + short
  high tone; Erfolg = two rising notes (≤ 300 ms); Fehler = soft low double tone, not a buzzer (≤ 250 ms).
- Volume normalised, default 70 %. Setting "Töne" (default on) plus a quick toggle in the board ⋮ menu. Sounds are
  never the only feedback. Audio starts only after a user gesture (browser autoplay rules).

---

## 7. Accessibility (target WCAG 2.2 AA)

### 7.1 Contrast
All text tokens ≥ 4.5:1 on all four surfaces in both themes; UI component boundaries and board markers ≥ 3:1 (tables
in 2.4). Exceptions are only the documented redundant cues (last-move highlight, check glow) and disabled controls.

### 7.2 Focus
- `:focus-visible` ring: `outline: 2px solid var(--zz-focus); outline-offset: 2px;` on every interactive element;
  inside the move list and segmented controls `outline-offset: -2px` (inset) so it is not clipped.
- Never remove outlines without this replacement. Focus order follows the visual order: navigation → board →
  panel tabs → panel content → actions.
- Board squares: the inset two-tone cursor from 4.4.
- After a puzzle ends, focus moves to "Nächstes Puzzle"; after a lesson step is answered, to "Weiter"; after closing a
  dialog, back to the element that opened it.

### 7.3 Touch targets
≥ 44 × 44 px for every target on touch devices (buttons, tabs, move-list rows, chips, icon buttons, quiz options,
promotion pieces). Board squares are ≥ 45 px at 360 px width; that is why the phone eval bar is horizontal.
Adjacent small targets keep ≥ 8 px spacing.

### 7.4 Keyboard
Global: `Tab`/`Shift+Tab` through regions; skip link "Zum Inhalt springen" as the first element.

Board (all board screens):
| Key | Action |
| --- | --- |
| `Tab` into the board | cursor on the selected or last-moved square, else on the own king's square |
| Arrow keys | move the cursor one square (orientation-aware) |
| `Enter` / `Space` | pick up the piece under the cursor; again on a target square: make the move |
| `Esc` | cancel the selection / close promotion picker (pawn returns) |
| `F` | Brett drehen |

Analysis and lessons (active when focus is inside the board area or panel, not in text fields – satisfies WCAG 2.1.4):
| Key | Analysis | Lesson |
| --- | --- | --- |
| `←` / `→` | previous / next move | previous step / next step (next only when the step is complete; = "Weiter") |
| `Home` / `End` | start / end of the game | first / current step |
| `↑` / `↓` | previous / next key moment | – |
| `Enter` | primary action ("Nochmal versuchen", "Weiter") | "Weiter" |
| `H` | – | Hinweis (Finde den Zug) |
| `?` | shows the shortcut overview (dialog) | same |

Puzzles: `H` Hinweis, `Enter` Nächstes Puzzle (after the end), `F` flip.

### 7.5 Screen readers
- Each square has an accessible name: "e4, weißer Bauer" / "d5, leer"; the board region `aria-label` "Schachbrett,
  du spielst Weiß".
- One `aria-live="polite"` region per board screen announces moves in words: "Weiß: Springer nach f3. Schach." and
  results: "Richtig!", "Puzzle gelöst. Rating 612, plus 8."
- Icons are `aria-hidden`; icon-only buttons have German `aria-label`s.
- `lang="de"` on `<html>`.

---

## 8. Learning design

### 8.1 Hint stages (puzzles, "Finde den Zug", analysis "Nochmal versuchen")

| Stage | Board | Text (panel, one sentence) | Button label afterwards |
| --- | --- | --- | --- |
| 0 – nothing used | – | task: "Weiß am Zug. Finde den besten Zug." | "Hinweis" |
| 1 – piece | hint ring on the piece to move | "Schau dir deinen Springer auf f3 an." (+ motif in Lernmodus: "Denk an eine Gabel.") | "Noch ein Hinweis" |
| 2 – target square | hint ring on the target (+ hint arrow in Einfache Ansicht) | "Er will nach e5." | "Lösung zeigen" |
| 3 – solution | the remaining solution is played (150 ms + 600 ms pause per move) | then the explanation (8.3) | "Nächstes Puzzle" |

- Bewertete Puzzles: before the first hint, a one-time confirm line under the button: "Ein Hinweis zählt das Puzzle
  als nicht gelöst." Tapping "Hinweis" again confirms (no modal).
- Lessons: under the hint button "Hinweise kosten einen Stern." (PRD: stars depend on errors and hints).
- Hints are never automatic. After 2 wrong attempts in Lernmodus/lessons the hint button gets a 2 px `accent` outline
  (an invitation, not a push).

### 8.2 Feedback timing

| Event | Visual | Sound | Timing |
| --- | --- | --- | --- |
| Any legal move | piece animates, last-move highlight | Zug/Schlag/Schach | 150 ms |
| Correct move (puzzle, lesson) | `--zz-hl-correct` + check badge on the destination, status "Richtig!" | – (Zug) | ≤ 100 ms after drop |
| Opponent reply in a puzzle | piece animates | Zug/Schlag | starts 500 ms after the learner's correct move (so the learner sees their move land) |
| Wrong move – Lernmodus/lessons | `--zz-hl-wrong` + X badge, one line why if available | Fehler | ≤ 100 ms; move undone after 700 ms; learner tries again |
| Wrong move – bewertet | same; status "Leider falsch – das Puzzle zählt als nicht gelöst." rating delta shown; learner may keep trying or "Lösung zeigen" | Fehler | ≤ 100 ms; undone after 700 ms |
| Puzzle solved | check badge, status "Gelöst!", rating delta chip, explanation appears in the panel | Erfolg | explanation ≤ 200 ms after the last move; **no auto-advance** – learner presses "Nächstes Puzzle" (`Enter`) |
| Coach warning (P0-08) | danger bubble, move held | – | the move is held while the check runs; if the engine has no answer after 800 ms the move is played without warning (never block play longer) |
| Coach praise (Coach mode) | praise bubble, badge on the board | – | after Brillant/Großartig/Bester Zug, at most once every 3 own moves |
| Coach threat (Coach mode) | `--zz-arrow-threat` + one line | – | right after the bot's move |
| Bot move | "{Bot} überlegt …" in its bar, then the move | Zug/… | 1–8 s think time (PRD) |
| Analysis retry correct | correct highlight, "Genau! Das war der bessere Zug." + explanation | Erfolg | ≤ 100 ms |
| Analysis retry wrong | wrong highlight, "Nicht ganz. Versuch es noch einmal." | Fehler | after 2 wrong tries the button "Besseren Zug zeigen" becomes primary |
| Lesson step answered | in-place feedback + "Weiter" focused | Erfolg/Fehler | ≤ 100 ms; never auto-advance |

### 8.3 Explanations: length and order
Applies to puzzle explanations, analysis explanations (LLM and rule-based), coach bubbles and lesson feedback.

1. **At most 3 sentences**, ideally ≤ 20 words each. Longer content goes behind "Mehr erfahren".
2. **Why before what**: sentence 1 = the consequence or idea (what goes wrong / what the move achieves);
   sentence 2 = the better move or the key move; optional sentence 3 = a transferable rule ("Merke: …").
3. Concrete: name pieces and squares ("dein Läufer auf c4"), not abstractions ("Materialverlust").
4. No engine numbers in the text (no "−2,3", no "Centipawns"). Numbers live in the eval bar/graph.
5. Only moves and facts the engine confirmed (P0-11) – the pipeline validates; the design only reserves space for
   max. 3 sentences (≈ 360 characters) and wraps longer server text into "Mehr erfahren".
6. Address the learner with "du", present tense, active voice, no blame ("Dein Läufer hängt", not "Du hast schlecht gespielt").

Template (illustrative; real moves come from the engine):
> "{Konsequenz: Nach deinem Zug ist der Läufer auf c4 ungedeckt, und der Springer kann ihn schlagen.}
> {Besser war {Zug}, weil {Idee}.} {Merke: Prüfe vor jedem Zug, welche deiner Figuren ungedeckt ist.}"

Bad: "Besser war Sf3. Dein Zug war eine Ungenauigkeit (−0,7)." (what before why, a number, no reason).

### 8.4 Retrieval practice and spacing
- In the analysis, "Nochmal versuchen" is the **primary** action on every Fehler/Patzer/Verpasst; the better move is only
  revealed via "Besseren Zug zeigen" (secondary). This is the PRD's retrieval loop.
- Lesson tests and "Finde den Zug" never show the answer before an attempt.
- When a puzzle fails and Wiederholung (P1-03) is built: a muted line after the explanation "Dieses Puzzle kommt in
  1 Tag wieder." and a dashboard card "Wiederholung: 5 fällig heute". Without P1-03 these elements are omitted.
- After a lesson (PRD "Verzahnung"): the completion sheet offers "Nächste Lektion" (primary), "Passende Puzzles" and
  "Übungspartie gegen {Bot}" (secondary).

### 8.5 Celebration vs noise

| Tier | When | What | Not |
| --- | --- | --- | --- |
| 1 – acknowledge | every correct move | square tint + small check badge (150 ms) | no sound beyond the move sound, no text beyond "Richtig!" |
| 2 – reward | puzzle solved, lesson step done, game won | Erfolg sound, status line, rating delta chip | no overlay, no modal |
| 3 – celebrate | lesson finished (stars), daily goal reached, streak milestone (3/7/30/100/365), new personal best | sheet/dialog with the big element (stars 40 px, ring 120 px, streak number) and **one** next action | max one tier-3 per action (if several happen, show the highest and list the others as lines); never during a running puzzle or game – queued until the task ends |

No confetti rain, no looping animation, no badges for trivial actions, no streak-loss warnings, no red for rating losses.

### 8.6 Cognitive load
- One primary button per view; max one coach bubble visible as "new" (older ones are muted below).
- Progressive disclosure: engine lines, numbers and variations behind "Mehr erfahren" or the "Züge"/"Analyse" tabs.
- Stable layout: the board never moves when feedback appears; feedback lives in fixed slots (status line, panel).
- Lesson text per step ≤ 60 words; one idea per step.

### 8.7 Einfache Ansicht (beginner presentation for ~200 Elo and newcomers)
A presentation layer, not a separate feature set: same screens, same data, different defaults and copy. Setting
"Einfache Ansicht" (switch in Einstellungen); **on by default** when the self-assessment at first start is
"Ich bin ganz neu" or "Ich kenne die Regeln" (the ~200 Elo persona); off for higher self-assessments. Implemented as
`data-simple="true"` on `<html>` plus a `useSimpleMode()` hook for copy/number decisions.

| Area | Standard | Einfache Ansicht |
| --- | --- | --- |
| Body text | 16 px | 18 px (`body-lg`); coach text 18 px |
| Buttons | md 44 / lg 52 px | md 48 / lg 56 px |
| Legal-move dots | 26 %, setting can hide them | 34 %, always on |
| Coordinates | setting | always on, 14 px |
| Hint stage 2 | ring on target | ring + arrow from piece to target |
| Check | glow + "Schach" | glow + "Schach! Dein König wird angegriffen." + threat arrow from the checking piece |
| Eval bar | bar + "+1,3" | bar without number; panel text by win percentage W (PRD formula): "Die Stellung ist ausgeglichen" (\|W−50\| < 5, ≈ under 0,5 Bauern), "Weiß/Schwarz steht etwas besser" (5–15, ≈ 0,5–1,7), "… steht deutlich besser" (15–30, ≈ 1,7–3,8), "… steht auf Gewinn" (> 30), "Weiß/Schwarz kann in {n} Zügen mattsetzen" (forced mate) |
| Accuracy | "78,4 %" | "78 %" |
| Classification | label | label + plain line, e.g. Patzer – "Dieser Zug verliert viel, oft eine Figur oder die Partie." · Fehler – "Dieser Zug verschlechtert deine Stellung deutlich." · Ungenauigkeit – "Es gab einen besseren Zug." · Verpasst – "Du hättest einen Fehler deines Gegners bestrafen können." · Bester Zug – "Der stärkste Zug in dieser Stellung." · Buchzug – "Ein bekannter Eröffnungszug." |
| Summary list | all 10 categories | only categories with count > 0 |
| Moves in text | "Sf3" | "Springer nach f3 (Sf3)" on first mention in a text |
| Motif terms | term | term + short definition on first use in a screen: "Gabel (eine Figur greift zwei Figuren gleichzeitig an)" |
| Engine lines | shown in "Mehr erfahren" | hidden; "Mehr erfahren" shows only the next 2 moves in words |
| Ratings | rating + delta | same (the learner's own progress is motivating); rating deviation (RD) is never shown in either view |

---

## 9. Microcopy (German, "du")

### 9.1 Tone rules
- Du-Form, short sentences, active voice, present tense. Friendly coach, not a cheerleader: max one "!" per screen.
- Terms follow the DSB translation of the FIDE Laws: Schach, Matt (Schachmatt), Patt, Rochade, en passant (im
  Vorbeigehen schlagen), Umwandlung, Remis, dreimalige Stellungswiederholung, 50-Züge-Regel. Final wording of draw
  reasons is confirmed by the rules auditor in `docs/team/RULES.md`; this file follows it.
- Numbers in German format via `Intl.NumberFormat('de-DE')`: "+1,3", "78,4 %", "1.250" (space before %).
- Move classification names exactly as in the PRD: Brillant, Großartig, Bester Zug, Exzellent, Gut, Buchzug,
  Ungenauigkeit, Fehler, Verpasst, Patzer.

### 9.2 Copy by screen

| Context | Text |
| --- | --- |
| Dashboard greeting | "Hallo {Name}" · sub-line "Schön, dass du da bist. Noch 8 Minuten bis zu deinem Tagesziel." |
| Hero card | "Weiter, wo du aufgehört hast" · "Lektion: Die Gabel · Schritt 4 von 7" · [Weitermachen] |
| Daily goal reached | "Tagesziel geschafft! 20 von 20 Minuten." · [Weiter trainieren] |
| Streak | "5 Tage" · "Heute noch offen" · "Neuer Anlauf – heute ist Tag 1." |
| Puzzle task | "Weiß am Zug. Finde den besten Zug." / "Schwarz am Zug. Setze matt in 2 Zügen." |
| Puzzle correct move | "Richtig! Weiter so." |
| Puzzle wrong (Lernmodus) | "Nicht ganz. Versuch es nochmal." |
| Puzzle wrong (bewertet) | "Leider falsch – das Puzzle zählt als nicht gelöst. Du kannst weiter probieren." |
| Puzzle solved | "Gelöst! Puzzle-Rating 612 (+8)" |
| Rated hint warning | "Ein Hinweis zählt das Puzzle als nicht gelöst." |
| Hint texts | "Schau dir deinen Springer auf f3 an." · "Er will nach e5." |
| Bot setup – Hilfe-Stufe | Wettkampf: "Keine Hilfen. Zählt für dein Bot-Rating." · Training: "Zurücknehmen, Hinweise und Bewertungsbalken. Zählt nicht fürs Rating." · Coach: "Wie Training – dazu warnt dich der Coach vor groben Fehlern und lobt starke Züge." |
| Game start | "Du spielst Weiß gegen {Bot} ({Elo})." |
| Coach warning | "Bist du sicher? Dein Läufer auf c4 hängt." · [Nochmal überlegen] [Trotzdem ziehen] |
| Coach threat | "Achtung: Der Springer droht deine Dame zu schlagen." |
| Coach praise | "Starker Zug! Damit greifst du zwei Figuren gleichzeitig an." |
| Draw claim available | "Diese Stellung ist jetzt zum dritten Mal entstanden. Du kannst Remis beanspruchen." · [Remis beanspruchen] · 50-Züge-Regel: "In den letzten 50 Zügen beider Seiten wurde weder eine Figur geschlagen noch ein Bauer gezogen. Du kannst Remis beanspruchen." |
| Game end | "Schachmatt – du hast gewonnen!" · "Schachmatt – {Bot} gewinnt." · "Patt – Remis. Wer am Zug ist, hat keinen legalen Zug, steht aber nicht im Schach." · "Remis durch dreimalige Stellungswiederholung." · "Remis durch fünfmalige Stellungswiederholung." · "Remis nach der 50-Züge-Regel." · "Remis nach der 75-Züge-Regel." · "Remis: Keine Seite kann mehr mattsetzen." · "Du hast aufgegeben." · [Analyse ansehen] (primary) [Neue Partie] |
| Resign confirm | "Partie wirklich aufgeben?" · [Aufgeben] (danger) [Weiterspielen] |
| Takeover (P0-02) | "Partie läuft auf einem anderen Gerät – hier übernehmen?" · [Hier übernehmen] [Abbrechen] |
| Analysis progress | "Analyse läuft … 18 von 40 Zügen" |
| Analysis summary | "Genauigkeit: Du 78,4 % · {Bot} 85,1 %" · "Schlüsselmomente" |
| Analysis mistake | "Patzer: Nach diesem Zug kann Schwarz deinen Turm schlagen." · [Nochmal versuchen] [Besseren Zug zeigen] |
| Retry correct / wrong | "Genau! Das war der bessere Zug." / "Nicht ganz. Versuch es noch einmal." |
| Explanation feedback | "War das hilfreich?" → "Danke!" |
| PGN import | label "PGN einfügen" · placeholder "1. e4 e5 2. Sf3 …" · [Datei hochladen] [Analysieren] |
| PGN error | "Zeile 12: „Sxe9“ ist kein gültiger Zug. Prüfe die Schreibweise und versuch es nochmal." |
| Lesson step | "Schritt 3 von 8" · "Finde den Zug, der zwei Figuren gleichzeitig angreift." |
| Lesson quiz | "Welcher Zug setzt matt?" → "Richtig! {Grund}." / "Leider nicht. {Grund}." |
| Lesson complete | "Lektion geschafft! 2 von 3 Sternen" · "1 Fehler · 0 Hinweise" · [Nächste Lektion] [Passende Puzzles] [Übungspartie] |
| Locked lesson | "Schließe zuerst „{Lektion}“ ab." |
| Leave rated puzzle | "Puzzle verlassen? Es zählt dann als nicht gelöst." · [Verlassen] [Weiterlösen] |
| Demo login limit (P0-01) | "Das waren deine 5 Demo-Puzzles. Melde dich an, damit dein Fortschritt gespeichert wird." · [Anmelden] |
| Login | "Mit E-Mail-Link anmelden" · "Mit Google anmelden" · after sending: "Wir haben dir einen Link an {E-Mail} geschickt." |

### 9.3 Sync and system messages
| State | Text |
| --- | --- |
| Offline | "Du bist offline. Puzzles laufen weiter – wir speichern alles, sobald du wieder online bist." |
| Nicht synchronisiert (PRD wording) | "Nicht synchronisiert. Wir versuchen es automatisch erneut – nichts geht verloren." |
| Back online, synced | toast "Wieder online. Alles ist gespeichert." |
| Local mode | "Lokaler Modus: Dein Fortschritt wird nur auf diesem Gerät gespeichert. Für den Abgleich mit anderen Geräten muss die Cloud-Synchronisierung eingerichtet werden." · [Mehr erfahren] |
| Engine loading / failed | see 5.12 |
| Export done | toast "Export erstellt. Die Datei wurde heruntergeladen." |
| Delete account confirm | "Konto und alle Daten endgültig löschen? Das kann nicht rückgängig gemacht werden." · [Endgültig löschen] (danger) [Abbrechen] |

---

## 10. chess.com patterns: adopted vs not copied

Adopted patterns (generic UX, PRD-mandated): sidebar with areas + board centre + context panel; phone tab bar with board
on top; player bars above/below the board; green primary buttons with a tactile bottom edge; evaluation bar beside the
board; move-classification badges on the destination square and in the move list; coach avatar with speech bubble;
key moments + "retry" in the review; three-stage puzzle hints; streak flame.

Not copied: logo, brand name, colour values (ours are newly chosen and contrast-checked), piece sets, board textures,
sounds, bot names/avatars/personalities, coach character, illustrations, icon set (we use lucide), wording of
chess.com UI texts, the exact classification icons artwork.

---

## 11. Implementation notes and review checklist

Suggested files (final paths per `CONVENTIONS.md`):
- `src/styles/tokens.css` – sections 2.1–2.3 verbatim; `src/styles/app.css` – 2.10.
- `src/ui/` – Button, Card, CoachBubble, EvalBar, MoveList, ProgressRing, ProgressBar, StreakBadge, Toast (Radix),
  Banner, SyncIndicator, EmptyState, ErrorState, Dialog/Sheet, SegmentedControl, Switch, Chip, RatingDelta, Stars,
  QuizOption, ClassificationBadge.
- `src/ui/classification.ts` – `CLASSIFICATION_META` (2.3) incl. `plain` lines (8.7).
- `src/board/boardTheme.ts` – maps board tokens to react-chessboard square/arrow/animation options (prop names depend on
  the installed react-chessboard version; read its README).
- `tokens.contrast.test.ts` – recomputes 2.4 and fails below target.
- Icon names are those of current `lucide-react` (older aliases: `Home`, `LineChart`, `UserCircle`, `AlertTriangle`,
  `AlertOctagon`).
- New dependencies to request from the integration step: `lucide-react` (ISC), `@fontsource-variable/inter` (OFL-1.1),
  Radix packages (`@radix-ui/react-dialog`, `-tabs`, `-toast`, `-toggle-group`, `-switch`, `-collapsible`, `-tooltip`).

What the design review checks (screenshots at 1440 px and 390 px, plus 360 px for overflow):
1. Only tokens used (no raw hex/default palette classes in components).
2. One primary button per view; next step obvious on every screen.
3. Board size rule (largest square that fits, multiple of 8, phone edge to edge, squares ≥ 44 px).
4. No horizontal overflow at 360 px; tab bar labels fully visible; action bar not covering content.
5. Feedback in place within 100 ms; no auto-advance; no learning feedback in toasts.
6. Explanations ≤ 3 sentences, why first, no numbers; German, "du".
7. Focus visible everywhere; keyboard maps in 7.4 work; touch targets ≥ 44 px.
8. Transitions ≤ 200 ms; reduced motion and "Animationen aus" give 0 ms; sounds toggle off.
9. Einfache Ansicht differences from 8.7 are present.
10. Sync states and empty/error states use the copy in 9.

---

## 12. Open points for the manager

1. **Six areas**: the PRD's IA graphic is not readable in the repo; this spec fixes them as Start, Puzzles, Spielen,
   Lernen, Analyse, Profil (Einstellungen inside Profil and in the sidebar footer). Please log in DECISIONS.md.
2. **Einfache Ansicht** is specified as a presentation setting serving the PRD personas (~200 Elo, newcomers);
   confirm it is in scope of the settings/dashboard packages.
3. **Coach warning budget** of 800 ms (8.2) is a UX limit for the engine check; the engine package should confirm
   it is reachable at low depth on a mid-range phone.
4. **Draw claims**: the UI provides "Remis beanspruchen" for the learner (threefold repetition, 50-move rule are
   claims per CONSTRAINTS); whether and when a bot claims is a game-logic decision for RULES.md.
5. **Bot names and avatars** (PRD open question "Design"): own names and SVG avatars are needed; the designer can
   deliver a list of 12 names/styles with the bot package if the manager wants it.

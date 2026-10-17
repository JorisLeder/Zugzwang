import { describe, expect, it } from 'vitest';
import { PUZZLE_THEMES, type Puzzle } from '@/core/puzzles';
import { puzzleChunkSchema } from '@/core/schemas';
import { FakeExplanationService, FIXTURE_PUZZLES } from '@/core/testing';
import { puzzleStartFen } from './check';
import { DEMO_PUZZLES } from './demo';
import { puzzleExplanation, puzzleFacts } from './explanation';
import { hintTextDe, motifHintDe, sideToMoveDe, taskTextDe } from './texts';
import { listTrainingThemes, MIN_LISTED_THEMES, motifTags, openingLabel, THEME_MIN_PUZZLES, themeSuccessRate, TRAINABLE_THEMES } from './themes';

const fixture = (id: string): Puzzle => structuredClone(FIXTURE_PUZZLES.find((p) => p.id === id)!);

describe('German task and hint texts (DESIGN §8.1, §9.2)', () => {
  it('names the side to move and the task', () => {
    expect(sideToMoveDe(fixture('fixture-knight-fork'))).toBe('Weiß am Zug');
    expect(taskTextDe(fixture('fixture-knight-fork'))).toBe('Weiß am Zug. Finde den besten Zug.');
    expect(taskTextDe(fixture('fixture-smothered-mate'))).toBe('Weiß am Zug. Setze matt in 2 Zügen.');
    expect(taskTextDe(fixture('fixture-two-mates'))).toBe('Weiß am Zug. Setze matt in 1 Zug.');
    const black = { ...fixture('fixture-knight-fork'), fen: '6k1/8/8/8/8/8/8/6K1 w - - 0 1' };
    expect(sideToMoveDe(black)).toBe('Schwarz am Zug');
  });

  it('builds the hint sentences per stage', () => {
    const p = fixture('fixture-knight-fork');
    const fen = puzzleStartFen(p);
    expect(hintTextDe(fen, 'd5e7', 1)).toBe('Schau dir deinen Springer auf d5 an.');
    expect(hintTextDe(fen, 'd5e7', 1, { motif: 'Denk an eine Gabel.' })).toBe('Schau dir deinen Springer auf d5 an. Denk an eine Gabel.');
    expect(hintTextDe(fen, 'd5e7', 2)).toBe('Er will nach e7.');
    expect(hintTextDe(puzzleStartFen(fixture('fixture-scholars-mate')), 'h5f7', 2)).toBe('Sie will nach f7.');
    expect(hintTextDe(fen, 'd5e7', 3)).toBe('Hier ist die Lösung.');
  });

  it('picks the most specific motif hint', () => {
    expect(motifHintDe(fixture('fixture-knight-fork'))).toBe('Denk an eine Gabel.');
    expect(motifHintDe(fixture('fixture-two-mates'))).toBe('Denk an ein Grundreihenmatt.');
    expect(motifHintDe({ themes: ['mateIn3'] })).toBe('Denk an ein Matt.');
    expect(motifHintDe({ themes: ['short'] })).toBeNull();
  });
});

describe('explanations after the puzzle (P0-05)', () => {
  it('uses the stored explanation', () => {
    const p = fixture('fixture-knight-fork');
    expect(puzzleExplanation(p, new FakeExplanationService())).toBe(p.explanation);
  });

  it('falls back to the rule-based explanation from the puzzle facts', () => {
    const { explanation: _omit, ...p } = fixture('fixture-smothered-mate');
    const facts = puzzleFacts(p);
    expect(facts).toMatchObject({ kind: 'puzzle', mover: 'w', bestMove: { uci: 'd5g8', san: 'Qg8+' }, bestLine: ['Qg8+', 'Rxg8', 'Nf7#'], mateIn: 2 });
    const text = puzzleExplanation(p, new FakeExplanationService());
    expect(text?.plain.length).toBeGreaterThan(0);
    expect(puzzleExplanation(p, { explainRuleBased: () => { throw new Error('boom'); } })).toBeNull();
  });
});

describe('themes (P0-06)', () => {
  it('offers at least 20 trainable motifs', () => {
    expect(TRAINABLE_THEMES.length).toBeGreaterThanOrEqual(MIN_LISTED_THEMES);
    expect(TRAINABLE_THEMES.every((t) => t.group !== 'meta')).toBe(true);
  });

  it('lists every trainable theme for a small bank and only well-filled themes for a full bank', () => {
    const small = listTrainingThemes(new Map([['fork', 3]]));
    expect(small).toHaveLength(TRAINABLE_THEMES.length);
    expect(small.find((e) => e.theme.id === 'fork')).toMatchObject({ count: 3, available: true });
    expect(small.find((e) => e.theme.id === 'pin')).toMatchObject({ count: 0, available: false });
    const full = new Map(TRAINABLE_THEMES.slice(0, 25).map((t) => [t.id, THEME_MIN_PUZZLES]));
    expect(listTrainingThemes(full)).toHaveLength(25);
    const filtered = listTrainingThemes(full, new Map([['fork', 2]]));
    expect(filtered.find((e) => e.theme.id === 'fork')).toMatchObject({ count: 2, available: true });
    expect(filtered.find((e) => e.theme.id === 'pin')).toMatchObject({ count: 0, available: false });
  });

  it('computes the success rate and the motif tags', () => {
    expect(themeSuccessRate(undefined)).toBeNull();
    expect(themeSuccessRate({ theme: 'fork', attempts: 0, successes: 0 })).toBeNull();
    expect(themeSuccessRate({ theme: 'fork', attempts: 8, successes: 5 })).toBe(62.5);
    expect(motifTags(fixture('fixture-knight-fork')).map((t) => t.labelDe)).toEqual(['Gabel', 'Mittelspiel']);
    expect(openingLabel('Sicilian_Defense_Najdorf_Variation')).toBe('Sicilian Defense Najdorf Variation');
  });
});

describe('demo puzzles (P0-01)', () => {
  it('are exactly 5 valid easy puzzles with explanations', () => {
    expect(DEMO_PUZZLES).toHaveLength(5);
    expect(puzzleChunkSchema.safeParse(DEMO_PUZZLES).success).toBe(true);
    for (const p of DEMO_PUZZLES) {
      expect(p.rating).toBeLessThanOrEqual(600);
      expect(p.explanation?.plain).toBeTruthy();
      expect(p.themes.every((t) => PUZZLE_THEMES.some((x) => x.id === t))).toBe(true);
    }
  });
});

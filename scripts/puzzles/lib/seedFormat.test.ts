import { describe, expect, it } from 'vitest';
import { puzzleSchema } from '@/core/schemas';
import { buildSeedPuzzles, SEED_MIN } from './seed/build';
import { buildManifest, serializeChunk, sha256Hex } from './bankFiles';
import { checkPuzzleStructure } from './puzzleChecks';
import { buildSeedPuzzle, explanationFromMarkup } from './seedFormat';

describe('explanationFromMarkup', () => {
  it('splits [[SAN]] markers into move segments and renders plain text in German notation', () => {
    const e = explanationFromMarkup('Mit [[Nxh4]] gewinnst du die Dame. Danach [[O-O]].', ['hanging_piece']);
    expect(e.segments).toEqual([
      { type: 'text', text: 'Mit ' },
      { type: 'move', san: 'Nxh4' },
      { type: 'text', text: ' gewinnst du die Dame. Danach ' },
      { type: 'move', san: 'O-O' },
      { type: 'text', text: '.' },
    ]);
    expect(e.plain).toBe('Mit Sxh4 gewinnst du die Dame. Danach 0-0.');
    expect(e).toMatchObject({ source: 'rule', motifs: ['hanging_piece'] });
  });
});

describe('buildSeedPuzzle', () => {
  it('converts SAN lines to UCI (Lichess format) and maps themes to motifs', () => {
    const p = buildSeedPuzzle({
      id: 't-1',
      fen: '6k1/5ppp/2n5/8/8/8/5PPP/RR4K1 b - - 0 1',
      line: ['Ne5', 'Rb8#'],
      rating: 450,
      themes: ['mateIn1', 'backRankMate'],
      explanation: '[[Rb8#]] setzt matt.',
    });
    expect(p).toMatchObject({ moves: ['c6e5', 'b1b8'], source: 'seed', ratingDeviation: 80, openingTags: [] });
    expect(p.explanation!.motifs).toEqual(['mate', 'back_rank']);
    expect(puzzleSchema.safeParse(p).success).toBe(true);
  });

  it('throws on an illegal move', () => {
    expect(() => buildSeedPuzzle({ id: 't-2', fen: '6k1/8/8/8/8/8/8/R5K1 b - - 0 1', line: ['Kg7', 'Ra9'], rating: 300, themes: [], explanation: 'x.' })).toThrow(
      /move 2/,
    );
  });
});

describe('seed bank sources', () => {
  const { seed, demo } = buildSeedPuzzles();

  it('has at least 40 puzzles, 20 of them rated ≤ 600, and exactly 5 demo puzzles', () => {
    expect(seed.length).toBeGreaterThanOrEqual(SEED_MIN.total);
    expect(seed.filter((p) => p.rating <= 600).length).toBeGreaterThanOrEqual(SEED_MIN.easy);
    expect(Math.max(...seed.map((p) => p.rating))).toBeLessThanOrEqual(1400);
    expect(demo).toHaveLength(5);
    expect(demo.every((p) => p.rating <= 600)).toBe(true);
  });

  it('passes the structural checks (the engine checks run in validate:content)', () => {
    for (const p of [...seed, ...demo]) expect(checkPuzzleStructure(p).errors, p.id).toEqual([]);
  });

  it('covers both colours and contains puzzles with two mating moves', () => {
    const blackSolves = seed.filter((p) => p.fen.split(' ')[1] === 'w');
    expect(blackSolves.length).toBeGreaterThanOrEqual(3);
    expect(seed.find((p) => p.id === 'seed-0036')!.explanation!.segments.filter((s) => s.type === 'move')).toHaveLength(2);
  });
});

describe('bank files', () => {
  it('derives the manifest version from the content', () => {
    const text = serializeChunk([]);
    const a = buildManifest('seed', [{ file: 'a.json', source: 'seed', count: 0, text }]);
    const b = buildManifest('seed', [{ file: 'a.json', source: 'seed', count: 0, text: serializeChunk([], true) + ' ' }]);
    expect(a.version).toMatch(/^seed-[0-9a-f]{12}$/);
    expect(a.version).not.toBe(b.version);
    expect(a.chunks[0]!.sha256).toBe(sha256Hex(text));
  });
});

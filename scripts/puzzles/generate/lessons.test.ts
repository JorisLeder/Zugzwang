import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import type { Lesson } from '@/core/lessons';
import { ChessGame, normalizeFen, positionKey, validateFen } from '@/lib/chess';
import { checkPuzzleStructure } from '../lib/puzzleChecks';
import { flaggedExercises, isSkip, lessonPuzzle, mainLine, positionPhase, readLessonExercises, retroMove } from './lessons';

const rootDir = resolve(__dirname, '../../..');

/** Plays the retro move and returns the resulting position key. */
function afterRetro(r: { fen: string; move: string }): string {
  const g = ChessGame.fromFen(r.fen);
  expect(g.move(r.move)).not.toBeNull();
  return positionKey(normalizeFen(g.fen()));
}

describe('retroMove', () => {
  const positions = [
    '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    'k7/8/1K6/8/8/8/7Q/8 w - - 0 1',
    'r5k1/pp4pp/8/8/8/8/PP3qPP/R5K1 w - - 0 1', // White in check: the retro move must give it
    'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
    'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', // e.p. square: the double step is forced
  ];

  it.each(positions)('finds a legal predecessor that reproduces %s', (fen) => {
    const r = retroMove(fen);
    expect(r).not.toBeNull();
    expect(validateFen(r!.fen).ok).toBe(true);
    expect(afterRetro(r!)).toBe(positionKey(normalizeFen(fen)));
  });

  it('prefers the piece the solution captures and forward moves', () => {
    expect(retroMove('3r2k1/5pp1/7p/2b5/8/7P/5PP1/2R3K1 w - - 0 1', 'c5')!.move.slice(2)).toBe('c5');
    // Fool's mate: the natural g2-g4 rather than a knight retreat.
    expect(retroMove('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2')!.move).toBe('g2g4');
  });

  it('keeps unmoved kings and rooks with castling rights in place', () => {
    // Black has only its unmoved king and rooks: no predecessor without losing the castling rights.
    expect(retroMove('r3k2r/8/8/8/8/8/8/4K3 w kq - 0 1')).toBeNull();
    // With a pawn on h6 the pawn move is the only candidate.
    expect(retroMove('r3k2r/8/7p/8/8/8/8/4K3 w kq - 0 1')!.move).toBe('h7h6');
  });

  it('uses the double step for an e.p. position', () => {
    expect(retroMove('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3')!.move).toBe('f7f5');
  });
});

describe('lesson puzzles', () => {
  const lesson = (steps: Lesson['steps']): Lesson => ({
    id: 'test-lektion',
    courseId: 'test',
    order: 1,
    version: 1,
    kind: 'lesson',
    titleDe: 'Test',
    summaryDe: 'Test',
    steps,
    practiceThemes: [],
  });
  const findMove = (id: string, fen: string, solution: Array<{ move: string; children: never[] }>, claim: { kind: 'best' } | { kind: 'mate'; mateIn: number }, puzzle?: { rating: number; themes: string[] }) => ({
    id,
    type: 'find_move' as const,
    promptDe: 'Finde den Zug.',
    fen,
    solution,
    acceptAnyMate: claim.kind === 'mate',
    claim,
    hintsDe: ['Tipp'],
    explanationDe: 'Erklärung.',
    ...(puzzle ? { puzzle } : {}),
  });

  it('exports flagged exercises in Lichess format with the flag rating', () => {
    const l = lesson([
      findMove('matt', '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', [{ move: 'a1a8', children: [] }], { kind: 'mate', mateIn: 1 }, { rating: 200, themes: ['mateIn1', 'backRankMate'] }),
      findMove('ohne-flag', '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', [{ move: 'a1a8', children: [] }], { kind: 'mate', mateIn: 1 }),
    ]);
    const ex = flaggedExercises(l);
    expect(ex).toHaveLength(1);
    const p = lessonPuzzle(ex[0]!);
    expect(isSkip(p)).toBe(false);
    if (isSkip(p)) return;
    expect(p).toMatchObject({ id: 'lesson-test-lektion-matt', rating: 200, source: 'lesson', moves: [expect.any(String), 'a1a8'] });
    expect(p.themes).toEqual(expect.arrayContaining(['mateIn1', 'backRankMate', 'mate', 'oneMove']));
    expect(checkPuzzleStructure(p).errors).toEqual([]);
    expect(p.explanation!.plain).toContain('Ta8#');
  });

  it('skips exercises with alternative non-mating first moves', () => {
    const l = lesson([
      findMove(
        'zwei',
        '4r1k1/pp3pp1/7p/3q4/8/2N4P/PP3PP1/3R2K1 w - - 0 1',
        [
          { move: 'd1d5', children: [] },
          { move: 'c3d5', children: [] },
        ],
        { kind: 'best' },
        { rating: 200, themes: ['hangingPiece'] },
      ),
    ]);
    expect(lessonPuzzle(flaggedExercises(l)[0]!)).toEqual({ id: 'lesson-test-lektion-zwei', reason: 'alternative first moves' });
  });

  it('follows the first branch of the move tree and ends with a learner move', () => {
    expect(mainLine([{ move: 'a', children: [{ move: 'b', children: [{ move: 'c', children: [] }] }, { move: 'x', children: [] }] }])).toEqual(['a', 'b', 'c']);
    expect(mainLine([{ move: 'a', children: [{ move: 'b', children: [] }] }])).toEqual(['a']);
  });

  it('classifies the phase of a single position', () => {
    expect(positionPhase('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe('opening');
    expect(positionPhase('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')).toBe('endgame');
  });

  it('exports the shipped lesson content (≥ 30 lesson puzzles, all structurally valid)', () => {
    const results = readLessonExercises(rootDir).map(lessonPuzzle);
    const puzzles = results.filter((r) => !isSkip(r));
    expect(puzzles.length).toBeGreaterThanOrEqual(30);
    for (const p of puzzles) {
      if (isSkip(p)) continue;
      expect(checkPuzzleStructure(p).errors, p.id).toEqual([]);
      expect(p.rating).toBeLessThanOrEqual(600);
    }
  });
});

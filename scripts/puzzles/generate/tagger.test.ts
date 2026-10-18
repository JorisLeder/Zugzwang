import { describe, expect, it } from 'vitest';
import { PUZZLE_THEMES } from '@/core/puzzles';
import { between, distance, lineContext, openingTagsFromName, sortThemes, tagPuzzle, type TagInput } from './tagger';

/** Known positions in Lichess format (fen before the opponent's move, moves[0] = opponent). */
const KNOWN: Record<string, TagInput> = {
  backRankMate: { fen: '6k1/p4ppp/2b5/8/8/8/P4PPP/4R1K1 b - - 0 1', moves: ['c6d5', 'e1e8'], mateIn: 1, phase: 'endgame' },
  smotheredMate: { fen: 'r6k/6pp/3N4/8/8/8/5PPP/6K1 b - - 0 1', moves: ['a8g8', 'd6f7'], mateIn: 1, phase: 'endgame' },
  smotheredMateIn2: { fen: '4r2k/pp4pp/7N/8/2Q5/8/5PPP/6K1 b - - 0 1', moves: ['e8d8', 'c4g8', 'd8g8', 'h6f7'], mateIn: 2, phase: 'middlegame' },
  arabianMate: { fen: 'r6k/pR6/5N2/8/8/8/5PPP/6K1 b - - 0 1', moves: ['a7a5', 'b7h7'], mateIn: 1, phase: 'endgame' },
  anastasiaMate: { fen: '1r6/pp2N1pk/8/3R4/8/8/5PPP/6K1 b - - 0 1', moves: ['b8a8', 'd5h5'], mateIn: 1, phase: 'endgame' },
  rookMate: { fen: '7R/8/8/8/8/8/k1K5/8 b - - 0 1', moves: ['a2a1', 'h8a8'], mateIn: 1, phase: 'endgame' },
  underPromotion: { fen: '6nb/5Ppk/7p/8/3B4/8/8/K7 b - - 0 1', moves: ['g7g6', 'f7f8n'], mateIn: 1, phase: 'endgame' },
  doubleCheckMate: { fen: '1r1qkb1r/ppp2ppp/8/8/8/8/PPP1BPPP/4R1K1 b - - 0 1', moves: ['b8a8', 'e2b5'], mateIn: 1, phase: 'middlegame' },
  foolsMate: { fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2', moves: ['g2g4', 'd8h4'], mateIn: 1, phase: 'opening' },
  hangingPiece: { fen: '3r1bk1/5pp1/7p/8/8/7P/5PP1/2R3K1 b - - 0 1', moves: ['f8c5', 'c1c5'], mateIn: null, finalCp: 800, phase: 'endgame' },
  knightFork: { fen: '3r2k1/pp3p1p/6p1/8/4N3/7P/PPP2PP1/6K1 b - - 0 1', moves: ['d8d7', 'e4f6', 'g8f8', 'f6d7'], mateIn: null, finalCp: 450, phase: 'endgame' },
  pin: { fen: '2q1k2r/pp3pp1/7p/8/8/2N4P/PPP2PP1/R3KB2 b - - 0 1', moves: ['c8d7', 'f1b5', 'd7b5', 'c3b5'], mateIn: null, finalCp: 700, phase: 'middlegame' },
  skewer: { fen: 'r7/pp3pp1/2k4p/8/8/7P/PPP1BPP1/6K1 b - - 0 1', moves: ['b7b6', 'e2f3', 'c6d6', 'f3a8'], mateIn: null, finalCp: 600, phase: 'endgame' },
  discoveredCheck: { fen: '2bqk2r/ppp2ppp/8/4N3/8/3B3P/PPP2PP1/4R1K1 b - - 0 1', moves: ['h7h6', 'e5c6', 'e8f8', 'c6d8'], mateIn: null, finalCp: 900, phase: 'middlegame' },
  capturingDefender: { fen: '1n4k1/pp1p1pp1/7p/1B2b3/8/5N1P/PPP2PP1/6K1 b - - 0 1', moves: ['b8c6', 'b5c6', 'd7c6', 'f3e5'], mateIn: null, finalCp: 300, phase: 'endgame' },
};

const tags = (name: keyof typeof KNOWN) => tagPuzzle(KNOWN[name]!);

describe('tagPuzzle on known positions', () => {
  it('tags mate length, mate and the length meta tag', () => {
    expect(tags('backRankMate')).toEqual(expect.arrayContaining(['mate', 'mateIn1', 'oneMove', 'backRankMate']));
    expect(tags('smotheredMateIn2')).toEqual(expect.arrayContaining(['mate', 'mateIn2', 'short', 'smotheredMate', 'sacrifice']));
  });

  it('adds mateInN only when the engine-confirmed distance equals the line', () => {
    expect(tagPuzzle({ ...KNOWN.smotheredMateIn2!, mateIn: null })).not.toContain('mateIn2');
    expect(tagPuzzle({ ...KNOWN.smotheredMateIn2!, mateIn: null })).toContain('mate');
  });

  it('recognises the mate patterns', () => {
    expect(tags('smotheredMate')).toContain('smotheredMate');
    expect(tags('arabianMate')).toContain('arabianMate');
    expect(tags('anastasiaMate')).toContain('anastasiaMate');
    expect(tags('rookMate')).not.toContain('backRankMate');
    expect(tags('smotheredMate')).not.toContain('backRankMate');
  });

  it('tags promotion and underpromotion', () => {
    expect(tags('underPromotion')).toEqual(expect.arrayContaining(['promotion', 'underPromotion', 'advancedPawn']));
  });

  it('tags double check and the discovered attack behind it', () => {
    expect(tags('doubleCheckMate')).toEqual(expect.arrayContaining(['doubleCheck', 'discoveredAttack', 'mateIn1']));
  });

  it('tags phase and the endgame type by material', () => {
    expect(tags('foolsMate')).toContain('opening');
    expect(tags('rookMate')).toEqual(expect.arrayContaining(['endgame', 'rookEndgame']));
    expect(tags('hangingPiece')).toContain('endgame');
    expect(tags('hangingPiece')).not.toContain('rookEndgame'); // Black still has a bishop at the start
  });

  it('tags a hanging piece only for an undefended non-pawn piece', () => {
    expect(tags('hangingPiece')).toEqual(expect.arrayContaining(['hangingPiece', 'oneMove', 'crushing']));
    expect(tags('knightFork')).not.toContain('hangingPiece');
  });

  it('confirms fork, pin and skewer by a later capture', () => {
    expect(tags('knightFork')).toEqual(expect.arrayContaining(['fork', 'short', 'advantage']));
    expect(tags('pin')).toContain('pin');
    expect(tags('skewer')).toContain('skewer');
    // Without the capture the fork is not confirmed.
    expect(tagPuzzle({ ...KNOWN.knightFork!, moves: ['d8d7', 'e4f6'] })).not.toContain('fork');
  });

  it('tags a discovered check and capturing the defender', () => {
    expect(tags('discoveredCheck')).toContain('discoveredAttack');
    expect(tags('capturingDefender')).toContain('capturingDefender');
  });

  it('returns only known theme ids in display order', () => {
    const order = PUZZLE_THEMES.map((t) => t.id);
    for (const name of Object.keys(KNOWN) as Array<keyof typeof KNOWN>) {
      const t = tags(name);
      expect(t.every((id) => order.includes(id))).toBe(true);
      expect(sortThemes(t)).toEqual(t);
    }
  });

  it('throws on an illegal line', () => {
    expect(() => tagPuzzle({ ...KNOWN.backRankMate!, moves: ['c6d5', 'e1e9'] })).toThrow();
    expect(lineContext(KNOWN.backRankMate!.fen, ['c6d5'])).toBeNull();
  });
});

describe('helpers', () => {
  it('computes geometry', () => {
    expect(between('a1', 'd4')).toEqual(['b2', 'c3']);
    expect(between('a1', 'b3')).toEqual([]);
    expect(distance('a1', 'h8')).toBe(7);
  });

  it('builds Lichess opening tags from book names', () => {
    expect(openingTagsFromName('Sicilian Defense: Dragon Variation, Yugoslav Attack')).toEqual(['Sicilian_Defense', 'Sicilian_Defense_Dragon_Variation']);
    expect(openingTagsFromName("King's Gambit Accepted")).toEqual(['Kings_Gambit_Accepted']);
    expect(openingTagsFromName(null)).toEqual([]);
  });
});

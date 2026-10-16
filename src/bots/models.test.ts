import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import type { EngineLine } from '@/core/engine';
import { ChessGame } from '@/lib/chess';
import { grossErrorCandidates, hangingPieces, movesIntoDanger, naturalTraits, plausibility } from './heuristics';
import { selectHumanMove } from './models/human';
import { chooseGrossError } from './models/skill';
import { createSeededRandom } from './random';

/** White knight on e5 attacked by the pawn d6 (undefended); e4 attacked by Nf6. */
const OWN_HANGING = 'rnbqkb1r/ppp2ppp/3p1n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 4';
/** Black queen on g5 en prise to Bc1. */
const QUEEN_EN_PRISE = 'rnb1kbnr/pppp1ppp/8/4p1q1/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 1 3';

function line(multipv: number, uci: string, cp: number): EngineLine {
  return { multipv, depth: 10, score: { type: 'cp', value: cp }, pv: [uci] };
}

describe('heuristics (rule-based errors of weak bots)', () => {
  it('finds hanging pieces with a one-step exchange estimate', () => {
    const own = hangingPieces(OWN_HANGING, 'w');
    expect(own.find((h) => h.square === 'e5')).toMatchObject({ piece: 'n', gain: 3 });
    expect(hangingPieces(QUEEN_EN_PRISE, 'b').find((h) => h.square === 'g5')).toMatchObject({ piece: 'q', gain: 9 });
    expect(hangingPieces(START_FEN, 'w')).toEqual([]);
  });

  it('kind 1: ignores the attacked piece (does not move it, does not take the attacker)', () => {
    const c = grossErrorCandidates(OWN_HANGING);
    expect(c.kind).toBe('ignore-attacked-piece');
    expect(c.moves.length).toBeGreaterThan(0);
    expect(c.moves.every((m) => m.from !== 'e5' && m.from !== 'e4' && m.to !== 'd6' && m.to !== 'f6')).toBe(true);
  });

  it('kind 2: misses a capture of a hanging enemy piece', () => {
    const c = grossErrorCandidates(QUEEN_EN_PRISE);
    expect(c.kind).toBe('miss-capture');
    expect(c.moves.some((m) => m.to === 'g5')).toBe(false);
  });

  it('kind 3/4: hangs a piece in a quiet position, removes the avoided move', () => {
    const c = grossErrorCandidates(START_FEN, 'e2e4');
    expect(['hang-piece', 'careless']).toContain(c.kind);
    expect(c.moves.some((m) => m.uci === 'e2e4')).toBe(false);
    const after = ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5']).fen();
    const hang = grossErrorCandidates(after);
    expect(hang.kind).toBe('hang-piece');
    // e.g. Qg4 or Bb5?? walk into an attack; every candidate really puts the moved piece en prise
    for (const m of hang.moves) expect(movesIntoDanger(after, m)).toBe(true);
  });

  it('plausibility prefers captures, checks and development over random king walks', () => {
    const game = ChessGame.fromFen(QUEEN_EN_PRISE);
    const moves = new Map(game.legalMoves().map((m) => [m.uci, m]));
    expect(plausibility(QUEEN_EN_PRISE, moves.get('c1g5')!)).toBeGreaterThan(plausibility(QUEEN_EN_PRISE, moves.get('e1e2')!));
    expect(plausibility(QUEEN_EN_PRISE, moves.get('g1f3')!)).toBeGreaterThan(plausibility(QUEEN_EN_PRISE, moves.get('a2a3')!));
  });

  it('chooses gross errors by plausibility, not uniformly', () => {
    const random = createSeededRandom(4);
    const counts = new Map<string, number>();
    for (let i = 0; i < 150; i++) {
      const e = chooseGrossError(QUEEN_EN_PRISE, { plausibilityTemperature: 1 }, random);
      counts.set(e!.uci, (counts.get(e!.uci) ?? 0) + 1);
      expect(e!.kind).toBe('miss-capture');
    }
    // A developing move is chosen more often than a king walk.
    expect(counts.get('g1f3') ?? 0).toBeGreaterThan(counts.get('e1e2') ?? 0);
  });

  it('naturalTraits marks recaptures, checks, development and castling', () => {
    const game = ChessGame.fromMoves(START_FEN, ['e2e4', 'd7d5', 'e4d5', 'd8d5']);
    const fen = game.fen();
    const legal = new Map(game.legalMoves().map((m) => [m.uci, m]));
    const prev = { to: 'd5' as const, captured: 'p' as const };
    expect(naturalTraits(fen, legal.get('b1c3')!, prev).development).toBe(true);
    const capture = ChessGame.fromMoves(START_FEN, ['e2e4', 'd7d5', 'b1c3', 'd5e4']);
    const recapture = capture.legalMoves().find((m) => m.uci === 'c3e4')!;
    expect(naturalTraits(capture.fen(), recapture, { to: 'e4', captured: 'p' }).recapture).toBe(true);
  });
});

describe('human model selection (800–2000, D-16)', () => {
  const lines = [line(1, 'e2e4', 30), line(2, 'd2d4', 25), line(3, 'g1f3', 20), line(4, 'a2a4', -60), line(5, 'f2f3', -120)];
  const natural = { recapture: 0, check: 0, capture: 0, development: 0, castle: 0 };

  it('computes the expected-points loss of each candidate vs the best', () => {
    const s = selectHumanMove(START_FEN, lines, { temperature: 0.01, natural }, () => 0)!;
    const best = s.candidates.find((c) => c.uci === 'e2e4')!;
    const bad = s.candidates.find((c) => c.uci === 'f2f3')!;
    expect(best.loss).toBe(0);
    expect(bad.loss).toBeGreaterThan(0.1);
    expect(s.spread).toBeGreaterThan(0);
  });

  it('a cold temperature plays the best move, a warm one varies – small losses far more often than big ones', () => {
    const cold = createSeededRandom(1);
    for (let i = 0; i < 50; i++) expect(selectHumanMove(START_FEN, lines, { temperature: 0.0005, natural }, cold)!.uci).toBe('e2e4');
    const warm = createSeededRandom(2);
    const counts = new Map<string, number>();
    for (let i = 0; i < 700; i++) {
      const uci = selectHumanMove(START_FEN, lines, { temperature: 0.03, natural }, warm)!.uci;
      counts.set(uci, (counts.get(uci) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(2);
    expect(counts.get('e2e4')!).toBeGreaterThan(counts.get('a2a4') ?? 0);
    expect(counts.get('d2d4')!).toBeGreaterThan(counts.get('f2f3') ?? 0);
    expect(counts.get('a2a4') ?? 0).toBeGreaterThan(counts.get('f2f3') ?? 0);
  });

  it('natural moves get a bonus (development preferred among equals)', () => {
    const equal = [line(1, 'h2h3', 20), line(2, 'g1f3', 20)];
    const random = createSeededRandom(7);
    let dev = 0;
    for (let i = 0; i < 300; i++) {
      const s = selectHumanMove(START_FEN, equal, { temperature: 0.02, natural: { ...natural, development: 1 } }, random)!;
      if (s.uci === 'g1f3') dev++;
    }
    expect(dev).toBeGreaterThan(180);
  });

  it('skips illegal or duplicate lines and returns null without candidates', () => {
    const s = selectHumanMove(START_FEN, [line(1, 'e2e5', 50), line(2, 'e2e4', 10), line(3, 'e2e4', 10)], { temperature: 0.02, natural }, () => 0.5);
    expect(s!.candidates.map((c) => c.uci)).toEqual(['e2e4']);
    expect(s!.spread).toBeNull();
    expect(selectHumanMove(START_FEN, [], { temperature: 0.02, natural }, () => 0.5)).toBeNull();
  });

  it('handles mate scores (mating move is clearly preferred)', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
    const mateLines: EngineLine[] = [
      { multipv: 1, depth: 10, score: { type: 'mate', value: 1 }, pv: ['a1a8'] },
      { multipv: 2, depth: 10, score: { type: 'cp', value: 500 }, pv: ['a1a7'] },
    ];
    const random = createSeededRandom(3);
    let mates = 0;
    for (let i = 0; i < 200; i++) if (selectHumanMove(fen, mateLines, { temperature: 0.012, natural }, random)!.uci === 'a1a8') mates++;
    expect(mates).toBeGreaterThan(150);
  });
});

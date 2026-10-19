import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import type { EngineLine } from '@/core/engine';
import { ChessGame } from '@/lib/chess';
import { grossErrorCandidates, hangingPieces, movesIntoDanger, naturalTraits, plausibility } from './heuristics';
import { comparableScore, rankWinPercent, selectHumanMove } from './models/human';
import { humanParams } from './params';
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
    const s = selectHumanMove(START_FEN, lines, { temperature: 0.01, sharpness: 1, natural }, () => 0)!;
    const best = s.candidates.find((c) => c.uci === 'e2e4')!;
    const bad = s.candidates.find((c) => c.uci === 'f2f3')!;
    expect(best.loss).toBe(0);
    expect(bad.loss).toBeGreaterThan(0.1);
    expect(s.spread).toBeGreaterThan(0);
  });

  it('a cold temperature plays the best move, a warm one varies – small losses far more often than big ones', () => {
    const cold = createSeededRandom(1);
    for (let i = 0; i < 50; i++) expect(selectHumanMove(START_FEN, lines, { temperature: 0.0005, sharpness: 2, natural }, cold)!.uci).toBe('e2e4');
    const warm = createSeededRandom(2);
    const counts = new Map<string, number>();
    for (let i = 0; i < 700; i++) {
      const uci = selectHumanMove(START_FEN, lines, { temperature: 0.03, sharpness: 1, natural }, warm)!.uci;
      counts.set(uci, (counts.get(uci) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(2);
    expect(counts.get('e2e4')!).toBeGreaterThan(counts.get('a2a4') ?? 0);
    expect(counts.get('d2d4')!).toBeGreaterThan(counts.get('f2f3') ?? 0);
    expect(counts.get('a2a4') ?? 0).toBeGreaterThan(counts.get('f2f3') ?? 0);
  });

  it('a bell-shaped kernel (sharpness 2) makes big losses much rarer than small ones', () => {
    const random = createSeededRandom(8);
    const counts = { small: 0, big: 0 };
    const mixed = [line(1, 'e2e4', 30), line(2, 'd2d4', 10), line(3, 'f2f3', -150)];
    for (let i = 0; i < 400; i++) {
      const uci = selectHumanMove(START_FEN, mixed, { temperature: 0.12, sharpness: 2, natural }, random)!.uci;
      if (uci === 'd2d4') counts.small++;
      if (uci === 'f2f3') counts.big++;
    }
    expect(counts.small).toBeGreaterThan(80);
    expect(counts.big).toBeLessThan(counts.small / 4);
  });

  it('natural moves get a bonus (development preferred among equals)', () => {
    const equal = [line(1, 'h2h3', 20), line(2, 'g1f3', 20)];
    const random = createSeededRandom(7);
    let dev = 0;
    for (let i = 0; i < 300; i++) {
      const s = selectHumanMove(START_FEN, equal, { temperature: 0.02, sharpness: 2, natural: { ...natural, development: 1 } }, random)!;
      if (s.uci === 'g1f3') dev++;
    }
    expect(dev).toBeGreaterThan(180);
  });

  it('skips illegal or duplicate lines and returns null without candidates', () => {
    const s = selectHumanMove(START_FEN, [line(1, 'e2e5', 50), line(2, 'e2e4', 10), line(3, 'e2e4', 10)], { temperature: 0.02, sharpness: 2, natural }, () => 0.5);
    expect(s!.candidates.map((c) => c.uci)).toEqual(['e2e4']);
    expect(s!.spread).toBeNull();
    expect(selectHumanMove(START_FEN, [], { temperature: 0.02, sharpness: 2, natural }, () => 0.5)).toBeNull();
  });

  it('handles mate scores (mating move is clearly preferred)', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
    const mateLines: EngineLine[] = [
      { multipv: 1, depth: 10, score: { type: 'mate', value: 1 }, pv: ['a1a8'] },
      { multipv: 2, depth: 10, score: { type: 'cp', value: 500 }, pv: ['a1a7'] },
    ];
    const random = createSeededRandom(3);
    let mates = 0;
    for (let i = 0; i < 200; i++) if (selectHumanMove(fen, mateLines, { temperature: 0.012, sharpness: 1, natural }, random)!.uci === 'a1a8') mates++;
    expect(mates).toBeGreaterThan(150);
  });

  describe('ranking beyond the ±1000 cp saturation (RPB-2)', () => {
    const KRK_MATE = '6k1/8/6K1/8/8/8/8/R7 w - - 0 1';
    const mate = (multipv: number, uci: string, n: number): EngineLine => ({ multipv, depth: 20, score: { type: 'mate', value: n }, pv: [uci] });

    it('maps mates and cp to comparable values from the mover view', () => {
      expect(comparableScore({ type: 'mate', value: 1 }, 'w')).toBe(99_999);
      expect(comparableScore({ type: 'mate', value: 1 }, 'b')).toBe(-99_999);
      expect(comparableScore({ type: 'mate', value: -3 }, 'b')).toBe(99_997);
      expect(comparableScore({ type: 'cp', value: 250 }, 'b')).toBe(-250);
    });

    it('shorter mates rank strictly higher, every mate above any cp, +900 above +500', () => {
      const r = (n: number) => rankWinPercent({ type: 'mate', value: n }, 'w');
      expect(r(1)).toBeGreaterThan(r(2));
      expect(r(2)).toBeGreaterThan(r(3));
      expect(r(30)).toBeGreaterThan(rankWinPercent({ type: 'cp', value: 5000 }, 'w'));
      expect(rankWinPercent({ type: 'cp', value: 900 }, 'w')).toBeGreaterThan(rankWinPercent({ type: 'cp', value: 500 }, 'w'));
      expect(rankWinPercent({ type: 'cp', value: 1500 }, 'w')).toBeGreaterThan(rankWinPercent({ type: 'cp', value: 1000 }, 'w'));
      expect(rankWinPercent({ type: 'mate', value: -2 }, 'w')).toBeLessThan(rankWinPercent({ type: 'cp', value: -5000 }, 'w'));
      expect(rankWinPercent({ type: 'cp', value: 300 }, 'w')).toBeCloseTo(rankWinPercent({ type: 'cp', value: 300 }, 'w'), 10);
    });

    it('a bot of 800–2000 Elo always plays mate in 1 over mate in 2/3 and a winning alternative', () => {
      const lines = [mate(1, 'a1a8', 1), mate(2, 'a1a7', 2), mate(3, 'a1b1', 3), line(4, 'a1a2', 900)];
      for (const elo of [800, 1200, 2000]) {
        const params = humanParams(elo);
        const random = createSeededRandom(elo);
        for (let i = 0; i < 300; i++) expect(selectHumanMove(KRK_MATE, lines, params, random)!.uci).toBe('a1a8');
      }
    });

    it('between mates the shorter one has the lower loss; +500 vs +900 differ in loss', () => {
      const natural = { recapture: 0, check: 0, capture: 0, development: 0, castle: 0 };
      const s = selectHumanMove(KRK_MATE, [mate(1, 'a1a7', 2), mate(2, 'a1b1', 3), line(3, 'a1a2', 900), line(4, 'a1a3', 500)], { temperature: 0.1, sharpness: 2, natural }, () => 0)!;
      const loss = (u: string) => s.candidates.find((c) => c.uci === u)!.loss;
      expect(loss('a1a7')).toBe(0);
      expect(loss('a1b1')).toBeGreaterThan(loss('a1a7'));
      expect(loss('a1a3')).toBeGreaterThan(loss('a1a2'));
      expect(loss('a1a2')).toBeGreaterThan(loss('a1b1'));
    });

    it('cp far beyond the ceiling (Stockfish KRK: +3000 … +9000) still ranks by cp difference', () => {
      const natural = { recapture: 0, check: 0, capture: 0, development: 0, castle: 0 };
      const s = selectHumanMove(KRK_MATE, [line(1, 'a1a2', 8749), line(2, 'a1a3', 8709), line(3, 'a1a4', 6750), line(4, 'a1a5', 1317)], { temperature: 0.07, sharpness: 3, natural }, () => 0)!;
      const loss = (u: string) => s.candidates.find((c) => c.uci === u)!.loss;
      expect(loss('a1a2')).toBe(0);
      expect(loss('a1a3')).toBeLessThan(0.01);
      expect(loss('a1a4')).toBeGreaterThan(0.15);
      expect(loss('a1a5')).toBeGreaterThan(loss('a1a4'));
      // A mate beats any cp score, however large.
      const m = selectHumanMove(KRK_MATE, [line(1, 'a1a2', 9165), mate(2, 'a1a8', 12)], { temperature: 0.07, sharpness: 3, natural }, () => 0)!;
      expect(m.candidates.find((c) => c.uci === 'a1a2')!.loss).toBeGreaterThan(0.01);
    });

    it('lines of +483..+497 cp still rank by cp (unchanged scale below 1000)', () => {
      const natural = { recapture: 0, check: 0, capture: 0, development: 0, castle: 0 };
      const cps = [497, 492, 488, 483];
      const ucis = ['a1a2', 'a1a3', 'a1a4', 'a1a5'];
      const s = selectHumanMove(KRK_MATE, cps.map((cp, i) => line(i + 1, ucis[i]!, cp)), { temperature: 0.05, sharpness: 2, natural }, () => 0)!;
      const losses = ucis.map((u) => s.candidates.find((c) => c.uci === u)!.loss);
      expect(losses[0]).toBe(0);
      expect([...losses].sort((a, b) => a - b)).toEqual(losses);
      expect(losses[3]!).toBeGreaterThan(0);
      expect(losses[3]!).toBeLessThan(0.01);
    });
  });
});

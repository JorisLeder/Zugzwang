import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { ChessGame, ChessRulesError } from './game';

const KNIGHT_SHUFFLE = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];

describe('ChessGame – game end per FIDE (D-04)', () => {
  it('checkmate ends the game (Fool’s mate)', () => {
    const g = ChessGame.fromMoves(START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(g.status()).toMatchObject({ isOver: true, result: '0-1', reason: 'checkmate', inCheck: true });
    expect(g.lastMove()?.isCheckmate).toBe(true);
    expect(g.legalMoves()).toEqual([]);
    expect(g.move('a2a3')).toBeNull();
  });

  it('stalemate is a draw', () => {
    const g = ChessGame.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(g.status()).toMatchObject({ isOver: true, result: '1/2-1/2', reason: 'stalemate', inCheck: false });
  });

  it('insufficient material (K+B v K) is a draw', () => {
    const g = ChessGame.fromFen('8/8/8/4k3/8/8/8/2B1K3 w - - 0 1');
    expect(g.status()).toMatchObject({ isOver: true, result: '1/2-1/2', reason: 'insufficient_material' });
  });

  it('threefold repetition is only claimable, the game goes on', () => {
    const g = ChessGame.fromMoves(START_FEN, [...KNIGHT_SHUFFLE, ...KNIGHT_SHUFFLE]);
    expect(g.repetitionCount()).toBe(3);
    const s = g.status();
    expect(s.isOver).toBe(false);
    expect(s.claimableDraws).toEqual(['threefold_repetition']);
    expect(g.move('e2e4')).not.toBeNull();
  });

  it('a threefold claim ends the game as a draw', () => {
    const g = ChessGame.fromMoves(START_FEN, [...KNIGHT_SHUFFLE, ...KNIGHT_SHUFFLE]);
    expect(g.claimDraw('fifty_moves')).toBe(false);
    expect(g.claimDraw('threefold_repetition')).toBe(true);
    expect(g.status()).toMatchObject({ isOver: true, result: '1/2-1/2', reason: 'threefold_repetition_claim' });
  });

  it('a claim is refused when nothing is claimable', () => {
    const g = ChessGame.fromFen(START_FEN);
    expect(g.claimDraw('threefold_repetition')).toBe(false);
    expect(g.status().isOver).toBe(false);
  });

  it('fivefold repetition ends the game automatically', () => {
    const moves = [...KNIGHT_SHUFFLE, ...KNIGHT_SHUFFLE, ...KNIGHT_SHUFFLE, ...KNIGHT_SHUFFLE];
    const g = ChessGame.fromMoves(START_FEN, moves);
    expect(g.repetitionCount()).toBe(5);
    expect(g.status()).toMatchObject({ isOver: true, result: '1/2-1/2', reason: 'fivefold_repetition' });
    expect(g.move('e2e4')).toBeNull();
  });

  it('the 50-move rule is only claimable (clock 100)', () => {
    const g = ChessGame.fromFen('8/8/8/4k3/8/8/8/R3K3 w - - 99 80');
    g.move('Ra2');
    expect(g.status()).toMatchObject({ isOver: false, claimableDraws: ['fifty_moves'] });
    expect(g.claimDraw('fifty_moves')).toBe(true);
    expect(g.status().reason).toBe('fifty_moves_claim');
  });

  it('the 75-move rule ends the game automatically (clock 150)', () => {
    const g = ChessGame.fromFen('8/8/8/4k3/8/8/8/R3K3 w - - 149 120');
    g.move('Ra2');
    expect(g.status()).toMatchObject({ isOver: true, result: '1/2-1/2', reason: 'seventyfive_moves' });
  });

  it('checkmate on the 150th half-move takes precedence over the 75-move rule', () => {
    const g = ChessGame.fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 149 120');
    const rec = g.move('Ra8#');
    expect(rec?.isCheckmate).toBe(true);
    expect(g.fen().split(' ')[4]).toBe('150');
    expect(g.status()).toMatchObject({ isOver: true, result: '1-0', reason: 'checkmate' });
  });

  it('checkmate on the 100th half-move is a win, not a 50-move claim', () => {
    const g = ChessGame.fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 99 80');
    g.move('Ra8#');
    expect(g.status()).toMatchObject({ isOver: true, reason: 'checkmate', claimableDraws: [] });
  });

  it('resigning against a side that cannot mate is a draw (5.1.2)', () => {
    const g = ChessGame.fromFen('8/8/8/4k3/8/8/8/3QK3 w - - 0 1');
    expect(g.resign('w')).toMatchObject({ isOver: true, result: '1/2-1/2', reason: 'resignation' });
    const h = ChessGame.fromFen('8/8/8/4k3/8/8/8/3QK3 w - - 0 1');
    expect(h.resign('b')).toMatchObject({ isOver: true, result: '1-0', reason: 'resignation' });
  });

  it('flag fall vs a side that cannot mate is a draw (6.9)', () => {
    const g = ChessGame.fromFen('8/8/8/4k3/8/8/8/3QK3 w - - 0 1');
    expect(g.flagFall('w')).toMatchObject({ result: '1/2-1/2', reason: 'timeout_vs_insufficient_material' });
    expect(ChessGame.fromFen('8/8/8/4k3/8/8/8/3QK3 w - - 0 1').flagFall('b')).toMatchObject({ result: '1-0', reason: 'timeout' });
  });
});

describe('ChessGame – repetition history and replay', () => {
  it('fromMoves keeps the repetition count; loading the last FEN does not', () => {
    const moves = [...KNIGHT_SHUFFLE, ...KNIGHT_SHUFFLE];
    const replayed = ChessGame.fromMoves(START_FEN, moves);
    expect(replayed.repetitionCount()).toBe(3);
    const fromFen = ChessGame.fromFen(replayed.fen());
    expect(fromFen.repetitionCount()).toBe(1);
    expect(fromFen.status().claimableDraws).toEqual([]);
  });

  it('positions differ when castling rights differ (9.2.2.2)', () => {
    const g = ChessGame.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    for (const m of ['Kf1', 'Kf8', 'Ke1', 'Ke8', 'Kf1', 'Kf8', 'Ke1', 'Ke8']) g.move(m);
    expect(g.repetitionCount()).toBe(2);
    expect(g.status().claimableDraws).toEqual([]);
  });

  it('the e.p. square only counts when the capture is legal (repetition key from fen())', () => {
    // After e2-e4 with no black pawn able to capture, fen() omits the e.p. square.
    const g = ChessGame.fromMoves(START_FEN, ['e2e4']);
    expect(g.fen().split(' ')[3]).toBe('-');
    const h = ChessGame.fromMoves(START_FEN, ['e2e4', 'a7a6', 'e4e5', 'd7d5']);
    expect(h.fen().split(' ')[3]).toBe('d6');
  });

  it('fromMoves throws a ChessRulesError naming the illegal move', () => {
    expect(() => ChessGame.fromMoves(START_FEN, ['e2e4', 'e2e4'])).toThrow(ChessRulesError);
    try {
      ChessGame.fromMoves(START_FEN, ['e2e4', 'e1e2', 'e7e5']);
    } catch (e) {
      expect((e as ChessRulesError).messageDe).toContain('Zug 2');
    }
  });

  it('undo restores position, repetition history and clears a resignation', () => {
    const g = ChessGame.fromMoves(START_FEN, [...KNIGHT_SHUFFLE, ...KNIGHT_SHUFFLE]);
    g.resign('w');
    expect(g.status().isOver).toBe(true);
    const removed = g.undo();
    expect(removed?.uci).toBe('f6g8');
    expect(g.status().isOver).toBe(false);
    expect(g.repetitionCount()).toBe(2); // same position as after ply 3
    expect(g.ply()).toBe(7);
  });
});

describe('ChessGame – moves', () => {
  it('accepts UCI, SAN, 0-0 and MoveInput and never throws on garbage', () => {
    const g = ChessGame.fromFen(START_FEN);
    expect(g.move('e2e4')?.san).toBe('e4');
    expect(g.move('e5')?.uci).toBe('e7e5');
    expect(g.move({ from: 'g1', to: 'f3' })?.san).toBe('Nf3');
    expect(g.move('xyz')).toBeNull();
    expect(g.move('')).toBeNull();
    expect(g.move({ from: 'a1', to: 'a8' })).toBeNull();
    const c = ChessGame.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(c.move('0-0')?.san).toBe('O-O');
  });

  it('rejects a promotion piece on a non-promotion move', () => {
    const g = ChessGame.fromFen(START_FEN);
    expect(g.move('e2e4q')).toBeNull();
    expect(g.move({ from: 'e2', to: 'e4', promotion: 'q' })).toBeNull();
    expect(g.ply()).toBe(0);
  });

  it('promotion requires a piece and supports Q, R, B and N (3.7.5)', () => {
    for (const p of ['q', 'r', 'b', 'n'] as const) {
      const g = ChessGame.fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1');
      expect(g.move({ from: 'a7', to: 'a8' })).toBeNull();
      const rec = g.move({ from: 'a7', to: 'a8', promotion: p });
      expect(rec?.promotion).toBe(p);
      expect(g.pieceAt('a8')).toEqual({ type: p, color: 'w' });
    }
  });

  it('fills MoveRecord fields (ply, move number, flags, FENs)', () => {
    const g = ChessGame.fromMoves(START_FEN, ['e2e4', 'a7a6', 'e4e5', 'd7d5']);
    const ep = g.move('e5d6');
    expect(ep).toMatchObject({ ply: 5, moveNumber: 3, color: 'w', san: 'exd6', piece: 'p', captured: 'p', isEnPassant: true });
    expect(ep?.fenBefore).toBe('rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const black = ChessGame.fromFen('4k3/8/8/8/8/8/8/R3K2R b K - 3 40');
    const r1 = black.move('Kd7');
    const r2 = black.move('O-O');
    expect(r1).toMatchObject({ ply: 1, moveNumber: 40, color: 'b' });
    expect(r2).toMatchObject({ ply: 2, moveNumber: 41, isCastle: true, uci: 'e1g1' });
  });

  it('legalMoves lists moves per square with flags', () => {
    const g = ChessGame.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const king = g.legalMoves('e1');
    expect(king.filter((m) => m.isCastle).map((m) => m.uci).sort()).toEqual(['e1c1', 'e1g1']);
  });

  it('legalSans lists the same SAN as legalMoves, "#" exactly for the mating moves', () => {
    const fens = [
      START_FEN,
      'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
      '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', // back-rank mate Ra8#
      '4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1', // Nbd2 / Nfd2 need disambiguation
      '7k/P7/8/8/8/8/8/K5R1 w - - 0 1', // promotions, Rh1+ check
    ];
    for (const fen of fens) {
      const g = ChessGame.fromFen(fen);
      const verbose = g.legalMoves();
      expect(g.legalSans().sort()).toEqual(verbose.map((m) => m.san).sort());
      for (const m of verbose) {
        const r = ChessGame.fromFen(fen).move(m.uci);
        expect(m.san.endsWith('#')).toBe(r!.isCheckmate);
      }
    }
    expect(ChessGame.fromFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1').legalSans()).toContain('Ra8#');
    expect(ChessGame.fromFen('4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1').legalSans()).toEqual(expect.arrayContaining(['Nbd2', 'Nfd2']));
    expect(ChessGame.fromMoves(START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4']).legalSans()).toEqual([]);
  });

  it('en passant is only allowed immediately (3.7.4.2)', () => {
    const now = ChessGame.fromMoves(START_FEN, ['e2e4', 'a7a6', 'e4e5', 'd7d5']);
    expect(now.legalMoves('e5').map((m) => m.san)).toContain('exd6');
    const later = ChessGame.fromMoves(START_FEN, ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'g1f3', 'h7h6']);
    expect(later.legalMoves('e5').map((m) => m.san)).not.toContain('exd6');
  });

  it('castling: legal and illegal cases (3.8.2)', () => {
    const sans = (fen: string) => ChessGame.fromFen(fen).legalMoves().map((m) => m.san);
    expect(sans('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toEqual(expect.arrayContaining(['O-O', 'O-O-O']));
    expect(sans('4k3/8/8/4r3/8/8/8/R3K2R w KQ - 0 1')).not.toContain('O-O'); // in check
    expect(sans('1k3r2/8/8/8/8/8/8/R3K2R w KQ - 0 1')).not.toContain('O-O'); // through attacked f1
    expect(sans('1k4r1/8/8/8/8/8/8/R3K2R w KQ - 0 1')).not.toContain('O-O'); // into attacked g1
    expect(sans('1r4k1/8/8/8/8/8/8/R3K2R w KQ - 0 1')).toContain('O-O-O'); // rook crosses attacked b1: legal
    expect(sans('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1')).not.toContain('O-O-O'); // piece between
  });
});

describe('ChessGame – FEN entry points and PGN', () => {
  it('fromFen rejects illegal positions with a German message', () => {
    expect(() => ChessGame.fromFen('4k3/4R3/8/8/8/8/8/4K3 w - - 0 1')).toThrow(/Schach/);
    expect(() => ChessGame.fromFen('not a fen')).toThrow(ChessRulesError);
  });

  it('fromFen strips inconsistent castling flags and bogus e.p. squares (RULES §5.4)', () => {
    expect(ChessGame.fromFen('r3k2r/8/8/8/8/8/8/R4K1R w KQkq - 0 1').fen()).toBe('r3k2r/8/8/8/8/8/8/R4K1R w kq - 0 1');
    expect(ChessGame.fromFen('4k3/8/8/4P3/8/8/8/4K3 w - d6 0 1').fen()).toBe('4k3/8/8/4P3/8/8/8/4K3 w - - 0 1');
  });

  it('writes PGN with O-O, FEN tag and result, and reads it back', () => {
    const g = ChessGame.fromMoves(START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const pgn = g.pgn({ White: 'Du', Black: 'Bot' });
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toContain('2. g4 Qh4# 0-1');
    const back = ChessGame.fromPgn(pgn);
    expect(back.uciMoves()).toEqual(g.uciMoves());
    expect(back.headers().White).toBe('Du');

    const custom = ChessGame.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    custom.move('O-O');
    const cpgn = custom.pgn();
    expect(cpgn).toContain('[SetUp "1"]');
    expect(cpgn).toContain('[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]');
    expect(cpgn).toContain('1. O-O');
    expect(ChessGame.fromPgn(cpgn).fen()).toBe(custom.fen());
  });

  it('fromPgn reports unreadable PGN as ChessRulesError', () => {
    expect(() => ChessGame.fromPgn('1. e4 e5 2. Ke3 Ke6 3. Qx9')).toThrow(ChessRulesError);
  });

  it('pgn() escapes quotes and backslashes in tags once and fromPgn reads them back', () => {
    const g = ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5']);
    const pgn = g.pgn({ Event: 'A "quoted" \\ event', Site: '' });
    expect(pgn).toContain('[Event "A \\"quoted\\" \\\\ event"]');
    expect(pgn).toContain('[Site ""]');
    const back = ChessGame.fromPgn(pgn);
    expect(back.headers().Event).toBe('A "quoted" \\ event');
    expect(back.headers().Site).toBe('');
    expect(back.history().map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(ChessGame.fromPgn(back.pgn()).headers().Event).toBe('A "quoted" \\ event');
  });
});

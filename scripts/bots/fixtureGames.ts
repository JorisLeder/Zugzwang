/**
 * Calibration positions for `npm run bots:calibrate` (BACKLOG WP-04: "≥ 200 positions from the fixture games"):
 * `FIXTURE_GAME` from `@/core/testing` plus five classical games (19th/20th century, moves are public facts).
 * Every position before a move is used (both colours), except positions with only one legal move.
 */
import { FIXTURE_GAME } from '@/core/testing';
import type { Fen, Uci } from '@/core/chess';
import { START_FEN } from '@/core/chess';
import { ChessGame } from '@/lib/chess';

/** A classical game as SAN move text (English letters). */
export interface ClassicalGame {
  id: string;
  title: string;
  san: string;
}

/** Classical games (well-known, moves are facts – no copyright). */
export const CLASSICAL_GAMES: ClassicalGame[] = [
  {
    id: 'opera-1858',
    title: 'Morphy – Herzog von Braunschweig/Graf Isouard, Paris 1858',
    san: 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#',
  },
  {
    id: 'immortal-1851',
    title: 'Anderssen – Kieseritzky, London 1851',
    san: 'e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 h4 Qg6 h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2 Na6 Nxg7+ Kd8 Qf6+ Nxf6 Be7#',
  },
  {
    id: 'evergreen-1852',
    title: 'Anderssen – Dufresne, Berlin 1852',
    san: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#',
  },
  {
    id: 'century-1956',
    title: 'D. Byrne – Fischer, New York 1956',
    san: 'Nf3 Nf6 c4 g6 Nc3 Bg7 d4 O-O Bf4 d5 Qb3 dxc4 Qxc4 c6 e4 Nbd7 Rd1 Nb6 Qc5 Bg4 Bg5 Na4 Qa3 Nxc3 bxc3 Nxe4 Bxe7 Qb6 Bc4 Nxc3 Bc5 Rfe8+ Kf1 Be6 Bxb6 Bxc4+ Kg1 Ne2+ Kf1 Nxd4+ Kg1 Ne2+ Kf1 Nc3+ Kg1 axb6 Qb4 Ra4 Qxb6 Nxd1 h3 Rxa2 Kh2 Nxf2 Re1 Rxe1 Qd8+ Bf8 Nxe1 Bd5 Nf3 Ne4 Qb8 b5 h4 h5 Ne5 Kg7 Kg1 Bc5+ Kf1 Ng3+ Ke1 Bb4+ Kd1 Bb3+ Kc1 Ne2+ Kb1 Nc3+ Kc1 Rc2#',
  },
  {
    id: 'kasparov-topalov-1999',
    title: 'Kasparov – Topalov, Wijk aan Zee 1999',
    san: 'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 Nge2 Nbd7 Bh6 Bxh6 Qxh6 Bb7 a3 e5 O-O-O Qe7 Kb1 a6 Nc1 O-O-O Nb3 exd4 Rxd4 c5 Rd1 Nb6 g3 Kb8 Na5 Ba8 Bh3 d5 Qf4+ Ka7 Rhe1 d4 Nd5 Nbxd5 exd5 Qd6 Rxd4 cxd4 Re7+ Kb6 Qxd4+ Kxa5 b4+ Ka4 Qc3 Qxd5 Ra7 Bb7 Rxb7 Qc4 Qxf6 Kxa3 Qxa6+ Kxb4 c3+ Kxc3 Qa1+ Kd2 Qb2+ Kd1 Bf1 Rd2 Rd7 Rxd7 Bxc4 bxc4 Qxh8 Rd3 Qa8 c3 Qa4+ Ke1 f4 f5 Kc1 Rd2 Qa7',
  },
];

/** One calibration position. */
export interface CalibrationPosition {
  /** `<game id>#<ply>` (ply of the move about to be played, 1-based). */
  id: string;
  fen: Fen;
  /** Start position of the game and the moves (UCI) that lead to `fen` (the bot sees the real game history). */
  startFen: Fen;
  moves: Uci[];
}

/** Replays a SAN move text from the start position. Throws on an illegal move (the games are checked by tests). */
export function replaySan(san: string): ChessGame {
  const game = ChessGame.fromFen(START_FEN);
  for (const [i, m] of san.trim().split(/\s+/).entries()) {
    if (!game.move(m)) throw new Error(`Illegal move ${i + 1} "${m}"`);
  }
  return game;
}

/** All calibration positions (deterministic order). */
export function calibrationPositions(): CalibrationPosition[] {
  const games: Array<{ id: string; game: ChessGame }> = [
    { id: 'fixture-game', game: ChessGame.fromMoves(FIXTURE_GAME.startFen, FIXTURE_GAME.moves) },
    ...CLASSICAL_GAMES.map((g) => ({ id: g.id, game: replaySan(g.san) })),
  ];
  const out: CalibrationPosition[] = [];
  for (const { id, game } of games) {
    const uci = game.uciMoves();
    for (const rec of game.history()) {
      const legal = ChessGame.fromFen(rec.fenBefore).legalMoves().length;
      if (legal > 1) out.push({ id: `${id}#${rec.ply}`, fen: rec.fenBefore, startFen: game.startFen(), moves: uci.slice(0, rec.ply - 1) });
    }
  }
  return out;
}

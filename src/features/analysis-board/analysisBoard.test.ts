import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { ChessGame } from '@/lib/chess';
import {
  exportFen,
  exportPgn,
  formatEngineLine,
  loadFen,
  loadFromParams,
  loadInput,
  looksLikeFen,
  movesToReplace,
  newLine,
  pgnDate,
  playAt,
  shownGame,
} from './analysisLine';
import {
  castlingAvailable,
  clearBoard,
  editorFen,
  editorFromFen,
  enPassantOptions,
  placeOnSquare,
  startPosition,
  validateEditor,
} from './editorLogic';

describe('analysis line', () => {
  it('steps forward when the same move is played and replaces later moves otherwise', () => {
    const line = { ...newLine(START_FEN, ['e2e4', 'e7e5', 'g1f3']), ply: 1 };
    expect(movesToReplace(line, 'e7e5')).toBe(0);
    expect(playAt(line, 'e7e5')).toEqual({ ...line, ply: 2 });
    expect(movesToReplace(line, 'c7c5')).toBe(2);
    expect(playAt(line, 'c7c5')).toEqual({ startFen: START_FEN, moves: ['e2e4', 'c7c5'], ply: 2 });
    const atEnd = newLine(START_FEN, ['e2e4']);
    expect(movesToReplace(atEnd, 'e7e5')).toBe(0);
    expect(playAt(atEnd, 'e7e5').moves).toEqual(['e2e4', 'e7e5']);
  });

  it('shows the position at the current ply', () => {
    const line = { ...newLine(START_FEN, ['e2e4', 'e7e5']), ply: 1 };
    expect(shownGame(line).fen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(exportFen(line)).toBe(shownGame(line).fen());
  });
});

describe('loading FEN and PGN', () => {
  it('detects FEN vs PGN', () => {
    expect(looksLikeFen(START_FEN)).toBe(true);
    expect(looksLikeFen('8/8/8/8/8/8/8/8')).toBe(true);
    expect(looksLikeFen('1. e4 e5')).toBe(false);
    expect(looksLikeFen('[Event "?"]\n1. e4')).toBe(false);
  });

  it('loads FENs with four, five or six fields', () => {
    expect(loadFen('8/P6k/8/8/8/8/8/K7 w - -')).toEqual({ ok: true, startFen: '8/P6k/8/8/8/8/8/K7 w - - 0 1', moves: [] });
    expect(loadFen('8/P6k/8/8/8/8/8/K7 w - - 3')).toMatchObject({ ok: true, startFen: '8/P6k/8/8/8/8/8/K7 w - - 3 1' });
  });

  it('rejects illegal positions with German messages', () => {
    expect(loadInput('8/8/8/8/8/8/8/8 w - - 0 1')).toEqual({ ok: false, errorDe: 'Weiß braucht genau einen König.' });
    const check = loadInput('4k3/4R3/8/8/8/8/8/4K3 w - - 0 1');
    expect(check).toEqual({ ok: false, errorDe: 'Schwarz ist nicht am Zug, steht aber im Schach – diese Stellung kann nicht entstehen.' });
    expect(loadInput('P3k3/8/8/8/8/8/8/4K3 w - - 0 1')).toEqual({ ok: false, errorDe: 'Bauern dürfen nicht auf der ersten oder achten Reihe stehen.' });
    expect(loadInput('   ')).toEqual({ ok: false, errorDe: 'Füge zuerst eine FEN oder PGN ein.' });
  });

  it('loads PGNs (main line, FEN tag) and explains failures in German', () => {
    const r = loadInput('1. e4 e5 2. Nf3 Nc6 3. Bb5 *');
    expect(r).toEqual({ ok: true, startFen: START_FEN, moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] });
    const tagged = loadInput('[SetUp "1"]\n[FEN "8/P6k/8/8/8/8/8/K7 w - - 0 1"]\n\n1. a8=Q *');
    expect(tagged).toEqual({ ok: true, startFen: '8/P6k/8/8/8/8/8/K7 w - - 0 1', moves: ['a7a8q'] });
    const bad = loadInput('1. e4 e5 2. Sf3');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errorDe).toMatch(/^Die PGN konnte nicht gelesen werden\./);
  });

  it('reads the URL parameters (PGN wins over FEN)', () => {
    expect(loadFromParams(null, null)).toEqual({ ok: true, startFen: START_FEN, moves: [] });
    expect(loadFromParams('8/P6k/8/8/8/8/8/K7 w - - 0 1', '1. d4 *')).toMatchObject({ ok: true, moves: ['d2d4'] });
    expect(loadFromParams('kaputt', null).ok).toBe(false);
  });
});

describe('export round trips', () => {
  it('FEN export → import gives the same position', () => {
    const line = newLine(START_FEN, ['e2e4', 'c7c5', 'g1f3']);
    const fen = exportFen(line);
    const back = loadInput(fen);
    expect(back).toEqual({ ok: true, startFen: fen, moves: [] });
  });

  it('PGN export → import gives the same game, also from a set-up position', () => {
    const date = new Date(2026, 9, 16);
    const line = newLine(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']);
    const pgn = exportPgn(line, date);
    expect(pgn).toContain('[Event "Analysebrett"]');
    expect(pgn).toContain('[Date "2026.10.16"]');
    expect(pgn).toContain('4. O-O');
    expect(loadInput(pgn)).toEqual({ ok: true, startFen: START_FEN, moves: line.moves });

    const setUp = newLine('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8q', 'h7g6']);
    const pgn2 = exportPgn(setUp, date);
    expect(pgn2).toContain('[FEN "8/P6k/8/8/8/8/8/K7 w - - 0 1"]');
    expect(loadInput(pgn2)).toEqual({ ok: true, startFen: setUp.startFen, moves: setUp.moves });
    expect(pgnDate(date)).toBe('2026.10.16');
  });
});

describe('formatEngineLine', () => {
  it('numbers moves and uses the user notation', () => {
    expect(formatEngineLine(START_FEN, { pv: ['e2e4', 'e7e5', 'g1f3'] }, 'de')).toEqual({ text: '1. e4 e5 2. Sf3', first: 'e4' });
    expect(formatEngineLine(START_FEN, { pv: ['g1f3'] }, 'en').text).toBe('1. Nf3');
    const black = ChessGame.fromMoves(START_FEN, ['e2e4']).fen();
    expect(formatEngineLine(black, { pv: ['e7e5', 'g1f3', 'b8c6'] }, 'de').text).toBe('1… e5 2. Sf3 Sc6');
    expect(formatEngineLine(START_FEN, { pv: [] }, 'de')).toEqual({ text: '', first: null });
  });
});

describe('position editor logic', () => {
  it('places, replaces and removes pieces', () => {
    let s = clearBoard(startPosition());
    expect(validateEditor(s)).toEqual({ ok: false, errorDe: 'Weiß braucht genau einen König.' });
    s = placeOnSquare(s, 'e1', 'wK');
    s = placeOnSquare(s, 'e8', 'bK');
    expect(validateEditor(s)).toEqual({ ok: true });
    s = placeOnSquare(s, 'd1', 'wQ');
    expect(editorFen(s)).toBe('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    s = placeOnSquare(s, 'd1', 'wR');
    expect(s.pieces.find((p) => p.square === 'd1')?.type).toBe('r');
    s = placeOnSquare(s, 'd1', 'wR');
    expect(s.pieces.find((p) => p.square === 'd1')).toBeUndefined();
    s = placeOnSquare(s, 'e8', 'erase');
    expect(validateEditor(s)).toEqual({ ok: false, errorDe: 'Schwarz braucht genau einen König.' });
  });

  it('keeps only castling rights whose king and rook are on their squares', () => {
    const s = editorFromFen(START_FEN);
    expect(editorFen(s)).toBe(START_FEN);
    const moved = placeOnSquare(s, 'h1', 'erase');
    expect(castlingAvailable(moved.pieces)).toEqual({ K: false, Q: true, k: true, q: true });
    expect(editorFen(moved).split(' ')[2]).toBe('Qkq');
    expect(editorFen({ ...s, castling: { K: false, Q: false, k: true, q: false } }).split(' ')[2]).toBe('k');
  });

  it('offers en-passant squares only behind a pawn that just advanced two squares', () => {
    const s = editorFromFen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(enPassantOptions(s.pieces, 'w')).toEqual(['d6']);
    expect(editorFen({ ...s, enPassant: 'd6' }).split(' ')[3]).toBe('d6');
    expect(editorFen({ ...s, enPassant: 'c6' }).split(' ')[3]).toBe('-');
    expect(validateEditor({ ...s, enPassant: 'd6' })).toEqual({ ok: true });
  });

  it('rejects the side not to move being in check (German message)', () => {
    let s = clearBoard(startPosition());
    s = placeOnSquare(placeOnSquare(placeOnSquare(s, 'e1', 'wK'), 'e8', 'bK'), 'e7', 'wR');
    expect(validateEditor(s)).toEqual({
      ok: false,
      errorDe: 'Schwarz ist nicht am Zug, steht aber im Schach – diese Stellung kann nicht entstehen.',
    });
    expect(validateEditor({ ...s, turn: 'b' })).toEqual({ ok: true });
  });
});

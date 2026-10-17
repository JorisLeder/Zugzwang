import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { FIXTURE_GAME } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import { parsePgnWithDiagnostics, PGN_LIMITS, type PgnGame } from './parser';

const DIR = join(__dirname, '__fixtures__');
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');

function parseOk(text: string): PgnGame[] {
  const r = parsePgnWithDiagnostics(text);
  if (!r.ok) throw new Error(`unexpected error: ${r.error.messageDe}`);
  return r.games;
}

function parseError(text: string) {
  const r = parsePgnWithDiagnostics(text);
  if (r.ok) throw new Error('expected an error');
  return r.error;
}

const sans = (g: PgnGame) => g.moves.map((m) => m.san).join(' ');

/** Expected outcome per fixture file (P0-15 acceptance criterion 7: ≥ 15 fixtures). */
const EXPECTED: Record<string, { games: Array<{ plies: number; result: string; last: string; startTurn?: 'w' | 'b'; reason?: string }> }> = {
  '01-simple.pgn': { games: [{ plies: 10, result: '1/2-1/2', last: 'Be7' }] },
  '02-comments.pgn': { games: [{ plies: 24, result: '0-1', last: 'c6' }] },
  '03-variations.pgn': { games: [{ plies: 7, result: '1-0', last: 'Ba4' }] },
  '04-nags.pgn': { games: [{ plies: 10, result: '*', last: 'Be7' }] },
  '05-fen-black-to-move.pgn': { games: [{ plies: 4, result: '*', last: 'Ba4', startTurn: 'b' }] },
  '06-promotions.pgn': { games: [{ plies: 8, result: '*', last: 'Bxb7' }] },
  '07-capture-promotion.pgn': { games: [{ plies: 4, result: '1-0', last: 'Kf6' }] },
  '08-white-mates.pgn': { games: [{ plies: 7, result: '1-0', last: 'Qxf7#', reason: 'checkmate' }] },
  '09-black-mates.pgn': { games: [{ plies: 4, result: '0-1', last: 'Qh4#', reason: 'checkmate' }] },
  '10-stalemate.pgn': { games: [{ plies: 19, result: '1/2-1/2', last: 'Qe6', reason: 'stalemate' }] },
  '11-unknown-result.pgn': { games: [{ plies: 8, result: '*', last: 'O-O' }] },
  '12-multi-game.pgn': {
    games: [
      { plies: 7, result: '1-0', last: 'Qxf7#', reason: 'checkmate' },
      { plies: 4, result: '0-1', last: 'Qh4#', reason: 'checkmate' },
      { plies: 4, result: '1/2-1/2', last: 'e6' },
    ],
  },
  '13-crlf-bom.pgn': { games: [{ plies: 8, result: '1-0', last: 'Nf6' }] },
  '14-castling-ep.pgn': { games: [{ plies: 16, result: '*', last: 'e6' }] },
  '15-lichess.pgn': { games: [{ plies: 24, result: '0-1', last: 'c6' }] },
  '16-chesscom.pgn': { games: [{ plies: 18, result: '1-0', last: 'Nd5' }] },
  '17-german-notation.pgn': { games: [{ plies: 29, result: '*', last: 'Qd2' }] },
  '18-escape-lines.pgn': { games: [{ plies: 10, result: '*', last: 'Nxd5' }] },
  '19-fixture-40-moves.pgn': { games: [{ plies: 80, result: '*', last: 'Rxf1+' }] },
  '20-no-tags.pgn': { games: [{ plies: 7, result: '*', last: 'Bxc4' }] },
};

describe('parsePgnWithDiagnostics – fixture files', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.pgn'));

  it('has at least 15 fixtures and an expectation for each', () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(files.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s parses correctly', (file, expected) => {
    const games = parseOk(read(file));
    expect(games).toHaveLength(expected.games.length);
    expected.games.forEach((e, i) => {
      const g = games[i]!;
      expect(g.index).toBe(i);
      expect(g.moves).toHaveLength(e.plies);
      expect(g.result).toBe(e.result);
      expect(g.headers.Result).toBe(e.result);
      expect(g.moves.at(-1)?.san).toBe(e.last);
      if (e.startTurn) expect(g.startFen.split(' ')[1]).toBe(e.startTurn);
      expect(g.status.reason ?? undefined).toBe(e.reason);
      // The clean PGN loads with the rules layer and gives the same main line (the review page relies on it).
      const replay = ChessGame.fromPgn(g.pgn);
      expect(replay.uciMoves()).toEqual(g.moves.map((m) => m.uci));
      expect(replay.startFen()).toBe(g.startFen);
    });
  });

  it('keeps tag pairs, ignores comments, NAGs and variations', () => {
    const [simple] = parseOk(read('01-simple.pgn'));
    expect(simple!.headers).toMatchObject({ Event: 'Vereinsabend', White: 'Anna Beispiel', Black: 'Ben Muster', Round: '3' });
    expect(simple!.startFen).toBe(START_FEN);

    const [variations] = parseOk(read('03-variations.pgn'));
    expect(sans(variations!)).toBe('e4 e5 Nf3 Nc6 Bb5 a6 Ba4');

    const [nags] = parseOk(read('04-nags.pgn'));
    expect(sans(nags!)).toBe('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7');

    const [comments] = parseOk(read('02-comments.pgn'));
    expect(comments!.pgn).not.toContain('Statistik');
    expect(comments!.pgn).not.toContain('{');
  });

  it('starts from the FEN tag and numbers moves from it', () => {
    const [g] = parseOk(read('05-fen-black-to-move.pgn'));
    expect(g!.startFen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
    expect(g!.moves[0]).toMatchObject({ san: 'Nc6', color: 'b', moveNumber: 2 });
    expect(g!.pgn).toContain('[SetUp "1"]');
    expect(g!.pgn).toContain('[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"]');
  });

  it('handles promotions (=Q, without "=", under-promotion, capture with promotion)', () => {
    const [g] = parseOk(read('06-promotions.pgn'));
    expect(g!.moves.map((m) => m.uci)).toEqual(['a7a8q', 'e8d7', 'h7h8n', 'a2a1r', 'e1d2', 'h2h1b', 'a8b7', 'h1b7']);
    expect(sans(g!)).toBe('a8=Q+ Kd7 h8=N a1=R+ Kd2 h1=B Qb7+ Bxb7');
    const [c] = parseOk(read('07-capture-promotion.pgn'));
    expect(c!.moves[0]).toMatchObject({ san: 'exd8=Q+', captured: 'r', promotion: 'q' });
  });

  it('handles castling with O and 0 and en passant with "e.p."', () => {
    const [g] = parseOk(read('14-castling-ep.pgn'));
    expect(g!.moves[4]).toMatchObject({ san: 'exf6', isEnPassant: true });
    expect(g!.moves.filter((m) => m.isCastle).map((m) => m.san)).toEqual(['O-O-O', 'O-O-O']);
    const [german] = parseOk(read('17-german-notation.pgn'));
    expect(german!.moves.slice(0, 9).map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']);
  });

  it('reads all results and the game end from the position', () => {
    const results = ['08-white-mates.pgn', '09-black-mates.pgn', '10-stalemate.pgn', '11-unknown-result.pgn'].map((f) => parseOk(read(f))[0]!.result);
    expect(results).toEqual(['1-0', '0-1', '1/2-1/2', '*']);
    // A checkmate in the moves wins over a contradicting marker.
    const [g] = parseOk('[Result "*"]\n\n1. f3 e5 2. g4 Qh4# *');
    expect(g!.result).toBe('0-1');
    // Without a marker the Result tag counts; without both it is "*".
    expect(parseOk('[Result "1-0"]\n\n1. e4 e5')[0]!.result).toBe('1-0');
    expect(parseOk('1. e4 e5')[0]!.result).toBe('*');
  });

  it('splits several games and records where each starts', () => {
    const games = parseOk(read('12-multi-game.pgn'));
    expect(games.map((g) => g.line)).toEqual([1, 9, 17]);
    expect(games.map((g) => g.headers.Round)).toEqual(['1', '2', '3']);
    // Games without a termination marker are split at the next tag section.
    const split = parseOk('[Event "a"]\n1. e4 e5\n[Event "b"]\n1. d4 d5 *');
    expect(split.map(sans)).toEqual(['e4 e5', 'd4 d5']);
  });

  it('treats BOM and CRLF like a plain file', () => {
    const crlf = read('13-crlf-bom.pgn');
    expect(crlf.charCodeAt(0)).toBe(0xfeff);
    expect(crlf).toContain('\r\n');
    const [a] = parseOk(crlf);
    const [b] = parseOk(crlf.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
    expect(a!.headers).toEqual(b!.headers);
    expect(sans(a!)).toBe(sans(b!));
  });

  it('parses the 40-move fixture game like FIXTURE_GAME', () => {
    const [g] = parseOk(FIXTURE_GAME.pgn);
    expect(g!.moves.map((m) => m.uci)).toEqual(FIXTURE_GAME.moves);
    expect(g!.moves.map((m) => m.san)).toEqual(FIXTURE_GAME.sans);
  });
});

describe('parsePgnWithDiagnostics – German errors with line numbers', () => {
  it('names line, move number and side of an illegal move', () => {
    const text = [
      '[Event "Fehler"]',
      '[Site "?"]',
      '[Date "2026.10.01"]',
      '[Round "1"]',
      '[White "A"]',
      '[Black "B"]',
      '[Result "*"]',
      '',
      '1. e4 e5 2. Nf3 Nc6',
      '3. Bb5 a6 4. Ba4 Nf6',
      '5. O-O Be7 6. Re1 b5',
      '7. Bb3 d6 8. Nf9 O-O *',
    ].join('\n');
    const e = parseError(text);
    expect(e.line).toBe(12);
    expect(e.column).toBe(14);
    expect(e.gameIndex).toBe(0);
    expect(e.messageDe).toBe('Zeile 12: Ungültiger Zug „Nf9“ (Zug 8, Weiß). Prüfe die Schreibweise und versuch es nochmal.');
  });

  it('reports Black moves and ambiguous moves', () => {
    expect(parseError('1. e4 e5\n2. Nf3 Qh5 *').messageDe).toBe(
      'Zeile 2: Ungültiger Zug „Qh5“ (Zug 2, Schwarz). Prüfe die Schreibweise und versuch es nochmal.',
    );
    // Two knights can reach d2 – the move is ambiguous and therefore invalid.
    expect(parseError('1. d4 d5 2. Nf3 Nf6\n\n3. Nd2 *').messageDe).toMatch(/^Zeile 3: Ungültiger Zug „Nd2“ \(Zug 3, Weiß\)/);
  });

  it('counts CRLF line breaks and comment lines correctly', () => {
    expect(parseError('[Event "x"]\r\n\r\n1. e4 e5 2. Ke3 *').line).toBe(3);
    expect(parseError('1. e4 { ein\nlanger\nKommentar } e5\n2. Bb6 *').line).toBe(4);
  });

  it('rejects a move after the end of the game', () => {
    const e = parseError('1. f3 e5 2. g4 Qh4# 3. Nf3 0-1');
    expect(e.messageDe).toBe('Zeile 1: Die Partie ist schon beendet (Schachmatt), danach steht aber noch der Zug „Nf3“.');
  });

  it('reports structural problems with their line', () => {
    expect(parseError('[Event "a"]\n[White "b"\n\n1. e4 *')).toMatchObject({ line: 2, messageDe: 'Zeile 2: Beim Tag „White“ fehlt die schließende Klammer „]“.' });
    expect(parseError('[Event "Turnier]\n1. e4 *')).toMatchObject({ line: 1, messageDe: 'Zeile 1: Der Text in Anführungszeichen wird in dieser Zeile nicht geschlossen.' });
    expect(parseError('[Event]\n1. e4 *').messageDe).toBe('Zeile 1: Beim Tag „Event“ fehlt der Wert in Anführungszeichen.');
    expect(parseError('[Event "a"]\n\n1. e4 e5 { offen\n2. Nf3 *')).toMatchObject({ line: 3, messageDe: 'Zeile 3: Der Kommentar „{“ wird nicht mit „}“ geschlossen.' });
    expect(parseError('1. e4 e5\n2. Nf3 (2. Nc3 Nc6\n3. Bb5 *')).toMatchObject({ line: 2, messageDe: 'Zeile 2: Die Variante „(“ wird nicht mit „)“ geschlossen.' });
    expect(parseError('1. e4 e5 ) 2. Nf3 *').messageDe).toBe('Zeile 1: Die Klammer „)“ schließt keine Variante.');
    expect(parseError('1. e4 ♘f6 *').messageDe).toMatch(/^Zeile 1: Unerwartetes Zeichen „♘“/);
    expect(parseError('1. e4 "e5" *').messageDe).toMatch(/^Zeile 1: Text in Anführungszeichen ist nur in Tags erlaubt/);
  });

  it('rejects an invalid FEN tag, unsupported variants and null moves', () => {
    const fen = parseError('[Event "x"]\n[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]\n\n1. e4 *');
    expect(fen.line).toBe(3);
    expect(fen.messageDe).toMatch(/^Zeile 3: Die Startstellung im FEN-Tag ist ungültig: /);
    expect(parseError('[Variant "Chess960"]\n\n1. e4 *').messageDe).toBe('Zeile 1: Die Variante „Chess960“ wird nicht unterstützt – nur normales Schach.');
    expect(parseError('1. e4 -- 2. d4 *').messageDe).toBe('Zeile 1: Nullzüge („--“) werden nicht unterstützt (Zug 1, Schwarz).');
  });

  it('points into the right game of a multi-game file', () => {
    const text = `${read('12-multi-game.pgn')}\n[Event "Kaputt"]\n\n1. e4 e5 2. Qh8 *\n`;
    const e = parseError(text);
    expect(e.gameIndex).toBe(3);
    expect(e.line).toBe(27);
    expect(e.messageDe).toMatch(/^Zeile 27: Ungültiger Zug „Qh8“ \(Zug 2, Weiß\)/);
  });

  it('explains empty input, text without a game and size limits', () => {
    expect(parseError('').messageDe).toBe('Zeile 1: Die PGN ist leer. Füge eine Partie ein oder lade eine Datei hoch.');
    expect(parseError('  \n\uFEFF \n').messageDe).toMatch(/Die PGN ist leer/);
    expect(parseError('{ nur ein Kommentar }').messageDe).toMatch(/^Zeile 1: In diesem Text wurde keine Partie gefunden/);
    expect(parseError('Hallo Welt').messageDe).toMatch(/^Zeile 1: Ungültiger Zug „Hallo“ \(Zug 1, Weiß\)/);
    expect(parseError('x'.repeat(PGN_LIMITS.maxChars + 1)).messageDe).toMatch(/zu groß/);
    const many = Array.from({ length: PGN_LIMITS.maxGames + 1 }, () => '1. e4 e5 *').join('\n');
    const tooMany = parseError(many);
    expect(tooMany.line).toBe(PGN_LIMITS.maxGames + 1);
    expect(tooMany.messageDe).toMatch(/mehr als 100 Partien/);
  });
});

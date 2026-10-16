/**
 * Notation helpers: UCI ↔ SAN (via chess.js) and display formatting (D-23, DESIGN §5.5).
 * Data always stores English SAN / UCI; `formatSan` converts for display.
 */
import { Chess } from 'chess.js';
import type { MoveInput, Notation, PieceSymbol, PromotionPiece, San, Square, Uci } from '@/core/chess';
import type { Fen } from '@/core/chess';

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

/** `true` if the string has UCI move shape (`e2e4`, `e7e8q`). */
export function isUci(s: string): boolean {
  return UCI_RE.test(s);
}

/** Parses a UCI string into a `MoveInput`; `null` if it is not UCI-shaped. */
export function parseUci(uci: Uci): MoveInput | null {
  const m = UCI_RE.exec(uci);
  if (!m) return null;
  const input: MoveInput = { from: m[1] as Square, to: m[2] as Square };
  if (m[3]) input.promotion = m[3] as PromotionPiece;
  return input;
}

/** Formats a `MoveInput` as UCI. */
export function toUci(move: MoveInput): Uci {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function loadQuiet(fen: Fen): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** English SAN of a UCI move in a position; `null` if the FEN is invalid or the move illegal (never throws). */
export function uciToSan(fen: Fen, uci: Uci): San | null {
  const input = parseUci(uci);
  const chess = loadQuiet(fen);
  if (!input || !chess) return null;
  try {
    const move = chess.move(input);
    if (input.promotion && !move.promotion) return null;
    return move.san;
  } catch {
    return null;
  }
}

/** Converts a list of UCI moves from `fen` to SAN; stops (returns the prefix) at the first illegal move. */
export function uciLineToSan(fen: Fen, line: readonly Uci[]): San[] {
  const chess = loadQuiet(fen);
  if (!chess) return [];
  const out: San[] = [];
  for (const uci of line) {
    const input = parseUci(uci);
    if (!input) break;
    try {
      out.push(chess.move(input).san);
    } catch {
      break;
    }
  }
  return out;
}

/** UCI of a SAN move in a position (accepts `0-0`, `O-O` and German letters K D T L S); `null` if illegal. */
export function sanToUci(fen: Fen, san: San): Uci | null {
  const chess = loadQuiet(fen);
  if (!chess) return null;
  try {
    const move = chess.move(sanFromDisplay(san));
    return `${move.from}${move.to}${move.promotion ?? ''}`;
  } catch {
    return null;
  }
}

const EN_TO_DE: Record<string, string> = { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' };
const DE_TO_EN: Record<string, string> = { K: 'K', D: 'Q', T: 'R', L: 'B', S: 'N' };

/**
 * Formats English SAN for display (D-23): `de` → K D T L S, promotion `=D`, castling `0-0`/`0-0-0`
 * (FIDE Appendix C); `en` → unchanged except castling written with the letter O.
 */
export function formatSan(san: San, notation: Notation): string {
  if (notation === 'en') return san.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
  const castled = san.replace(/^O-O-O/, '0-0-0').replace(/^O-O/, '0-0');
  return castled.replace(/[KQRBN]/g, (ch) => EN_TO_DE[ch] ?? ch);
}

/** Converts displayed SAN (German or English letters, `0-0`) back to English SAN (best effort, for input fields). */
export function sanFromDisplay(text: string): San {
  const t = text.trim().replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
  // Piece letter at the start, and a promotion piece after "=".
  return t.replace(/^[DTLS]/, (ch) => DE_TO_EN[ch] ?? ch).replace(/=([DTLS])/, (_, ch: string) => `=${DE_TO_EN[ch] ?? ch}`);
}

const PIECE_NAMES_DE: Record<PieceSymbol, string> = {
  p: 'Bauer',
  n: 'Springer',
  b: 'Läufer',
  r: 'Turm',
  q: 'Dame',
  k: 'König',
};

/** German piece name (DSB): Bauer, Springer, Läufer, Turm, Dame, König. */
export function pieceNameDe(piece: PieceSymbol): string {
  return PIECE_NAMES_DE[piece];
}

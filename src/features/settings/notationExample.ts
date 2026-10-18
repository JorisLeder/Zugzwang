/**
 * Example line of the notation setting: the first moves of the Spanish Game (1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4
 * Nf6 5. O-O), converted by the rules layer so every move is legal and the SAN is exact. It shows pawn moves, knights,
 * bishops and castling – the letters that differ between German and English notation.
 */
import { START_FEN, type Color, type San, type Uci } from '@/core/chess';
import { uciLineToSan } from '@/lib/chess';

/** The example moves in UCI. */
export const NOTATION_EXAMPLE_UCI: readonly Uci[] = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1'];

/** One move of the example. */
export interface ExampleMove {
  moveNumber: number;
  color: Color;
  san: San;
}

/** The example line as English SAN with move numbers. */
export function notationExample(): ExampleMove[] {
  return uciLineToSan(START_FEN, NOTATION_EXAMPLE_UCI).map((san, i) => ({
    moveNumber: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? 'w' : 'b',
    san,
  }));
}

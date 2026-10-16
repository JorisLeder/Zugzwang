/** Pure helpers of the move list. */
import type { MoveRecord } from '@/core/chess';

/** One row of the move list: move number with White's and Black's half-move (either may be missing). */
export interface MovePair {
  number: number;
  white?: MoveRecord;
  black?: MoveRecord;
}

/**
 * Groups half-moves into numbered pairs. A game that starts with Black to move gets a first row without White's move
 * ("12. … Sc6").
 */
export function movePairs(moves: readonly MoveRecord[]): MovePair[] {
  const rows: MovePair[] = [];
  for (const m of moves) {
    const last = rows[rows.length - 1];
    if (m.color === 'w' || !last || last.number !== m.moveNumber || last.black) rows.push({ number: m.moveNumber });
    rows[rows.length - 1]![m.color === 'w' ? 'white' : 'black'] = m;
  }
  return rows;
}

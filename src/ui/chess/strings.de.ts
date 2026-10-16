/** German strings of the chess UI widgets (D-35). */
import type { MoveRecord, PieceSymbol } from '@/core/chess';

const PIECE: Record<PieceSymbol, string> = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };

export const CHESS_UI_DE = {
  moveList: 'Zugliste',
  navigation: 'Zugnavigation',
  first: 'Zum Anfang',
  prev: 'Zurück',
  next: 'Vor',
  last: 'Zum Ende',
  noMoves: 'Noch keine Züge',
  evalLabel: (text: string, words: string) => `Bewertung: ${words} (${text})`,
  equal: 'Die Stellung ist ausgeglichen',
  /** "Weiß steht etwas besser" … by centipawns (White POV). */
  advantage: (side: 'w' | 'b', size: 'slight' | 'clear' | 'decisive') =>
    `${side === 'w' ? 'Weiß' : 'Schwarz'} steht ${size === 'slight' ? 'etwas besser' : size === 'clear' ? 'besser' : 'deutlich besser'}`,
  /** "Weiß setzt in 3 Zügen matt". */
  mateIn: (side: 'w' | 'b', n: number) => `${side === 'w' ? 'Weiß' : 'Schwarz'} setzt in ${n === 1 ? 'einem Zug' : `${n} Zügen`} matt`,
  mated: 'Matt',
  /** Move in words for screen readers: "Springer f3", "Bauer schlägt d5", "kurze Rochade". */
  moveInWords: (m: Pick<MoveRecord, 'piece' | 'to' | 'captured' | 'isCastle' | 'promotion' | 'isCheck' | 'isCheckmate'>) => {
    let text: string;
    if (m.isCastle) text = m.to[0] === 'g' ? 'kurze Rochade' : 'lange Rochade';
    else text = `${PIECE[m.piece]}${m.captured ? ' schlägt' : ''} ${m.to}`;
    if (m.promotion) text += `, Umwandlung in ${PIECE[m.promotion]}`;
    if (m.isCheckmate) text += ', Schachmatt';
    else if (m.isCheck) text += ', Schach';
    return text;
  },
  /** Accessible name of a half-move: "12. Zug Weiß: Sf3 (Springer f3), Bester Zug" (DESIGN §5.5; keeps the visible text). */
  moveLabel: (moveNumber: number, color: 'w' | 'b', san: string, words: string, classification?: string) =>
    `${moveNumber}. Zug ${color === 'w' ? 'Weiß' : 'Schwarz'}: ${san} (${words})${classification ? `, ${classification}` : ''}`,
} as const;

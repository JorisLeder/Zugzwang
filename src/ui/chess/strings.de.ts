/** German strings of the chess UI widgets (D-35). */
export const CHESS_UI_DE = {
  moveList: 'Zugliste',
  navigation: 'Zugnavigation',
  first: 'Zum Anfang',
  prev: 'Zurück',
  next: 'Vor',
  last: 'Zum Ende',
  evalLabel: (text: string, side: string) => `Bewertung: ${side} (${text})`,
  whiteBetter: 'Weiß steht besser',
  blackBetter: 'Schwarz steht besser',
  equal: 'Die Stellung ist ausgeglichen',
  moveWords: (moveNumber: number, color: 'w' | 'b', san: string) => `${moveNumber}. Zug ${color === 'w' ? 'Weiß' : 'Schwarz'}: ${san}`,
} as const;

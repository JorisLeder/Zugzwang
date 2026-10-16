/** German strings of the board (D-35). */
export const BOARD_DE = {
  boardLabel: (orientation: 'white' | 'black') => `Schachbrett, du spielst ${orientation === 'white' ? 'Weiß' : 'Schwarz'}`,
  promotionTitle: 'Umwandeln in …',
  promotionPieces: { q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer' },
  promotionCancel: 'Umwandlung abbrechen',
} as const;

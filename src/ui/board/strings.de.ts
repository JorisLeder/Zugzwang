/** German strings of the board (D-35). */
import type { Color, MoveRecord, PieceSymbol } from '@/core/chess';

const PIECE: Record<PieceSymbol, string> = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
const PROMOTION_ACC: Record<string, string> = { q: 'eine Dame', r: 'einen Turm', b: 'einen Läufer', n: 'einen Springer' };

export const BOARD_DE = {
  boardLabel: (orientation: 'white' | 'black') => `Schachbrett, du spielst ${orientation === 'white' ? 'Weiß' : 'Schwarz'}`,
  boardRoleDescription: 'Schachbrett',
  instructions:
    'Mit den Pfeiltasten wählst du ein Feld. Mit Eingabe oder Leertaste nimmst du eine Figur auf und ziehst sie auf das gewählte Feld. Escape hebt die Auswahl auf.',
  instructionsFlip: 'Mit F drehst du das Brett.',
  promotionTitle: 'Umwandeln in …',
  promotionPieces: { q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer' },
  promotionCancel: 'Umwandlung abbrechen',
  empty: 'leer',
  selected: 'ausgewählt',
  target: 'Zug möglich',
  flip: 'Brett drehen',
  moreActions: 'Weitere Aktionen',
  soundOn: 'Töne',
  settings: 'Einstellungen',
  feedbackCorrect: 'Richtig',
  feedbackWrong: 'Falsch',
  /** "weißer Bauer", "schwarze Dame". */
  pieceWithColor: (type: PieceSymbol, color: Color) => {
    const feminine = type === 'q';
    const adjective = color === 'w' ? (feminine ? 'weiße' : 'weißer') : feminine ? 'schwarze' : 'schwarzer';
    return `${adjective} ${PIECE[type]}`;
  },
  /** "Weiß: Springer nach f3. Schach." (DESIGN §7.5). */
  moveSentence: (m: MoveRecord) => {
    const side = m.color === 'w' ? 'Weiß' : 'Schwarz';
    let action: string;
    if (m.isCastle) action = m.to[0] === 'g' ? 'kurze Rochade' : 'lange Rochade';
    else if (m.isEnPassant) action = `Bauer schlägt en passant auf ${m.to}`;
    else if (m.captured) action = `${PIECE[m.piece]} schlägt auf ${m.to}`;
    else action = `${PIECE[m.piece]} nach ${m.to}`;
    if (m.promotion) action += `, Umwandlung in ${PROMOTION_ACC[m.promotion]}`;
    const suffix = m.isCheckmate ? ' Schachmatt.' : m.isCheck ? ' Schach.' : '';
    return `${side}: ${action}.${suffix}`;
  },
} as const;

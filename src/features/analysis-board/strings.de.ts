/** German strings of the Analysebrett (D-35). */
import type { GameEndReason } from '@/core/chess';

const END_REASON: Partial<Record<GameEndReason, string>> = {
  checkmate: 'Schachmatt',
  stalemate: 'Patt – Remis',
  insufficient_material: 'Remis: Keine Seite kann mehr mattsetzen',
  fivefold_repetition: 'Remis durch fünfmalige Stellungswiederholung',
  seventyfive_moves: 'Remis nach der 75-Züge-Regel',
};

export const STRINGS_DE = {
  title: 'Analysebrett',
  tabEngine: 'Engine',
  tabMoves: 'Züge',
  panelTabs: 'Bereiche des Analysebretts',
  invalidPosition: 'Diese Stellung kann nicht geladen werden.',
  openEmptyBoard: 'Leeres Analysebrett öffnen',
  noMoves: 'Noch keine Züge. Ziehe eine Figur auf dem Brett.',
  flip: 'Brett drehen',
  setup: 'Stellung aufbauen',
  whiteToMove: 'Weiß am Zug',
  blackToMove: 'Schwarz am Zug',
  gameOver: (reason: GameEndReason, winner: 'w' | 'b' | null) => {
    const base = END_REASON[reason] ?? 'Die Partie ist beendet';
    if (reason === 'checkmate' && winner) return `${base} – ${winner === 'w' ? 'Weiß' : 'Schwarz'} gewinnt`;
    return base;
  },

  // Engine
  engineToggle: 'Engine',
  engineToggleHint: 'Stockfish zeigt dir die zwei besten Fortsetzungen mit Bewertung.',
  engineLoading: 'Engine wird geladen …',
  engineLoadingPercent: (p: number) => `Engine wird geladen … ${p} %`,
  engineFailed: 'Die Engine konnte nicht starten. Lade die Seite neu.',
  engineReload: 'Neu laden',
  engineThinking: 'Engine rechnet …',
  engineNoMoves: 'Keine Züge mehr möglich – die Partie ist beendet.',
  engineLines: 'Engine-Varianten',
  depth: (d: number) => `Tiefe ${d}`,
  evalLabel: (text: string) => `Bewertung ${text}`,
  playLine: (san: string) => `Zug ${san} spielen`,

  // Import / export
  ioHeading: 'Stellung und Partie',
  fenLabel: 'FEN der aktuellen Stellung',
  copyFen: 'FEN kopieren',
  copyPgn: 'PGN kopieren',
  downloadPgn: 'PGN herunterladen',
  fenCopied: 'FEN kopiert.',
  pgnCopied: 'PGN kopiert.',
  pgnDownloaded: 'PGN heruntergeladen.',
  copyFailed: 'Kopieren hat nicht geklappt. Markiere den Text und kopiere ihn selbst.',
  importLabel: 'FEN oder PGN laden',
  importPlaceholder: 'FEN (z. B. rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1) oder PGN (1. e4 e5 2. Nf3 …)',
  importButton: 'Laden',
  importEmpty: 'Füge zuerst eine FEN oder PGN ein.',
  importDone: 'Geladen.',
  playVsBot: 'Gegen Bot ausspielen',
  pgnEvent: 'Analysebrett',
  pgnFileName: 'zugzwang-analyse.pgn',

  // Replace later moves
  replaceTitle: 'Spätere Züge ersetzen?',
  replaceText: (n: number) =>
    n === 1
      ? 'Wenn du hier einen anderen Zug spielst, wird der folgende Zug gelöscht.'
      : `Wenn du hier einen anderen Zug spielst, werden die ${n} folgenden Züge gelöscht.`,
  replaceConfirm: 'Züge ersetzen',
  replaceCancel: 'Abbrechen',

  // Position editor
  editorHeading: 'Stellung aufbauen',
  editorBoardLabel: 'Stellungseditor',
  editorPalette: 'Figur zum Setzen wählen',
  editorErase: 'Figur entfernen',
  editorPiece: (name: string) => `${name} setzen`,
  editorPlaced: (square: string, what: string) => `${square}: ${what}`,
  editorStart: 'Grundstellung',
  editorClear: 'Brett leeren',
  editorTurn: 'Am Zug',
  editorWhite: 'Weiß',
  editorBlack: 'Schwarz',
  editorCastling: 'Rochaderechte',
  castleWK: 'Weiß 0-0 (kurz)',
  castleWQ: 'Weiß 0-0-0 (lang)',
  castleBK: 'Schwarz 0-0 (kurz)',
  castleBQ: 'Schwarz 0-0-0 (lang)',
  editorEp: 'En-passant-Feld',
  editorEpNone: 'keins',
  editorValid: 'Die Stellung ist gültig.',
  editorApply: 'Stellung übernehmen',
  editorCancel: 'Abbrechen',
  editorHint: 'Wähle eine Figur und tippe auf ein Feld. Ein zweiter Tipp entfernt sie wieder.',
} as const;

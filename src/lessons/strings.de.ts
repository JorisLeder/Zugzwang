/**
 * German texts produced by the lesson domain logic (D-35): stage names, hint sentences, play-out reasons and content
 * error messages for authors. UI strings of the pages live in `src/features/lessons/strings.de.ts`.
 */
import type { PieceSymbol } from '@/core/chess';

/** Accusative with the possessive "dein": "deinen Springer", "deine Dame", "deinen Bauern". */
const PIECE_ACCUSATIVE: Record<PieceSymbol, string> = {
  k: 'deinen König',
  q: 'deine Dame',
  r: 'deinen Turm',
  b: 'deinen Läufer',
  n: 'deinen Springer',
  p: 'deinen Bauern',
};

/** Personal pronoun for the piece ("Er" / "Sie" for the queen). */
const PIECE_PRONOUN: Record<PieceSymbol, string> = { k: 'Er', q: 'Sie', r: 'Er', b: 'Er', n: 'Er', p: 'Er' };

export const LESSONS_DE = {
  stages: {
    0: { name: 'Neuling', elo: 'ca. 0–400 Elo' },
    1: { name: 'Einsteiger', elo: 'ca. 400–800 Elo' },
    2: { name: 'Clubspieler', elo: 'ca. 800–1200 Elo' },
    3: { name: 'Fortgeschritten', elo: 'ca. 1200–1600 Elo' },
    4: { name: 'Experte', elo: 'ca. 1600–2000+ Elo' },
  },
  stageTitle: (id: number, name: string) => `Stufe ${id} · ${name}`,
  /** Hint stage "piece" (DESIGN §8.1). */
  pieceHint: (piece: PieceSymbol, square: string) => `Schau dir ${PIECE_ACCUSATIVE[piece]} auf ${square} an.`,
  /** Hint stage "target square". */
  targetHint: (piece: PieceSymbol, square: string) => `${PIECE_PRONOUN[piece]} will nach ${square}.`,
  playOutReason: {
    userMated: 'Schachmatt – du hast gewonnen.',
    userWasMated: 'Schachmatt – der Bot hat gewonnen.',
    promoted: 'Dein Bauer hat sich umgewandelt.',
    held: 'Du hast die Stellung gehalten.',
    drawn: 'Die Partie ist remis.',
    stalemate: 'Patt – Remis. Wer am Zug ist, hat keinen regelgemäßen Zug, steht aber nicht im Schach.',
    movesExhausted: (n: number) => (n === 1 ? 'Du hattest nur einen Zug.' : `Du hattest ${n} Züge.`),
  },
  errors: {
    catalogMissing: 'content/lessons/catalog.json fehlt.',
    catalogInvalid: 'Der Katalog ist ungültig',
    courseInvalid: (index: number) => `Kurs Nr. ${index + 1} im Katalog ist ungültig`,
    duplicateCourse: (id: string) => `Kurs-ID „${id}“ ist doppelt.`,
    duplicateLesson: (id: string) => `Lektions-ID „${id}“ kommt in mehreren Kursen vor.`,
    notFound: 'Die Datei wurde nicht gefunden.',
    importFailed: 'Die Datei konnte nicht geladen werden (ungültiges JSON?).',
    schema: 'Die Lektion entspricht nicht dem Schema',
    idMismatch: (field: string, expected: string, actual: string) => `${field} ist „${actual}“, erwartet wird „${expected}“ (Dateipfad).`,
    illegalFen: (where: string, reason: string) => `${where}: ungültige Stellung – ${reason}`,
    illegalMove: (where: string, move: string) => `${where}: Zug ${move} ist nicht regelgemäß.`,
    step: (id: string) => `Schritt „${id}“`,
    assert: (id: string, n: number) => `Schritt „${id}“, Prüfung ${n + 1}`,
    unknownFile: 'Die Datei liegt nicht unter content/lessons/<kurs>/<lektion>.json.',
  },
} as const;

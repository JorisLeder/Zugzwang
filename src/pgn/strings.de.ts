/** German messages of the PGN parser (D-35). Every message names the line ("Zeile 12: …", P0-15). */
export const PGN_DE = {
  /** Prefix of every diagnostic. */
  at: (line: number) => `Zeile ${line}: `,
  empty: 'Die PGN ist leer. Füge eine Partie ein oder lade eine Datei hoch.',
  noGame: 'In diesem Text wurde keine Partie gefunden. Eine PGN beginnt mit Tags wie [Event "…"] oder mit den Zügen („1. e4 e5 …“).',
  tooLarge: (maxKb: number) => `Die PGN ist zu groß (höchstens ${maxKb} KB). Teile die Datei auf und importiere sie in mehreren Teilen.`,
  tooManyGames: (max: number) => `Die PGN enthält mehr als ${max} Partien. Importiere höchstens ${max} Partien auf einmal.`,
  unexpectedChar: (ch: string) => `Unerwartetes Zeichen „${ch}“. Prüfe die Schreibweise und versuch es nochmal.`,
  unterminatedComment: 'Der Kommentar „{“ wird nicht mit „}“ geschlossen.',
  unterminatedString: 'Der Text in Anführungszeichen wird in dieser Zeile nicht geschlossen.',
  tagMissingName: 'Nach „[“ fehlt der Name des Tags, z. B. [Event "Vereinsabend"].',
  tagMissingValue: (name: string) => `Beim Tag „${name}“ fehlt der Wert in Anführungszeichen.`,
  tagMissingClose: (name: string) => `Beim Tag „${name}“ fehlt die schließende Klammer „]“.`,
  unexpectedString: 'Text in Anführungszeichen ist nur in Tags erlaubt, z. B. [White "Anna"].',
  unexpectedBracket: 'Die Klammer „]“ gehört zu keinem Tag.',
  tagAfterMoves: 'Ein Tag steht mitten in den Zügen. Trenne Partien mit einem Ergebnis wie „1-0“ oder „*“.',
  strayMovetext: (moveNumber: string) =>
    `Hier stehen Züge ab Zug ${moveNumber} ohne eigene Tags, nach dem Ergebnis der vorigen Partie. Gib der Partie Tags wie [Event "…"] oder lösche die übrigen Züge.`,
  invalidFen: (detail: string) => `Die Startstellung im FEN-Tag ist ungültig: ${detail}`,
  unsupportedVariant: (variant: string) => `Die Variante „${variant}“ wird nicht unterstützt – nur normales Schach.`,
  invalidMove: (san: string, moveNumber: number, side: string) =>
    `Ungültiger Zug „${san}“ (Zug ${moveNumber}, ${side}). Prüfe die Schreibweise und versuch es nochmal.`,
  moveAfterEnd: (san: string, reason: string) => `Die Partie ist schon beendet (${reason}), danach steht aber noch der Zug „${san}“.`,
  nullMove: (moveNumber: number, side: string) => `Nullzüge („--“) werden nicht unterstützt (Zug ${moveNumber}, ${side}).`,
  unclosedVariation: 'Die Variante „(“ wird nicht mit „)“ geschlossen.',
  unexpectedCloseVariation: 'Die Klammer „)“ schließt keine Variante.',
  white: 'Weiß',
  black: 'Schwarz',
  endReasons: {
    checkmate: 'Schachmatt',
    stalemate: 'Patt',
    insufficient_material: 'keine Seite kann mehr mattsetzen',
    fivefold_repetition: 'fünfmalige Stellungswiederholung',
    seventyfive_moves: '75-Züge-Regel',
  } as Record<string, string>,
  endReasonFallback: 'Partieende',
} as const;

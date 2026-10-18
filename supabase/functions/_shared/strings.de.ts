/** German texts the edge functions send to the app (shown to the user as is, "du"). */
export const FUNCTIONS_DE = {
  signInRequired: 'Bitte melde dich an, um fortzufahren.',
  invalidRequest: 'Die Anfrage ist ungültig. Lade die Seite neu und versuch es nochmal.',
  tooLarge: 'Die Anfrage ist zu groß. Importiere höchstens 1000 KB PGN auf einmal.',
  methodNotAllowed: 'Diese Anfrage wird nicht unterstützt.',
  externalImportNotSupported: 'Der Import über eine externe ID kommt erst in einer späteren Version.',
  oneGameOnly: (n: number) => `Die PGN enthält ${n} Partien. Importiere bitte eine Partie pro Anfrage.`,
  importFailed: 'Der Import hat nicht geklappt. Versuch es später nochmal.',
  deleteFailed: 'Das Konto konnte nicht gelöscht werden. Versuch es später nochmal.',
} as const;

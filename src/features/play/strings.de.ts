/**
 * German strings of the play feature (D-35, DESIGN §9.2, RULES §3 / finding R-03: "Remis beantragen").
 */
import type { AssistanceLevel } from '@/core/games';
import type { BotGroupId } from '@/bots';

const sideDe = (c: 'w' | 'b') => (c === 'w' ? 'Weiß' : 'Schwarz');

export const STRINGS_DE = {
  // --- routes / titles
  play: 'Spielen',
  playGame: 'Partie',
  playFromPosition: 'Aus Stellung spielen',

  // --- hub
  hubSubtitle: 'Wähle einen Gegner. Jeder Bot hat seinen eigenen Stil.',
  continueTitle: 'Partie fortsetzen',
  continueMeta: (level: string, moves: number) => `${level} · ${moves === 0 ? 'noch kein Zug' : moves === 1 ? '1 Zug gespielt' : `${moves} Züge gespielt`}`,
  continueAction: 'Weiterspielen',
  continueGame: (bot: string, elo: number) => `Partie gegen ${bot} (${elo})`,
  groups: {
    beginner: 'Zum Einstieg (bis 800)',
    intermediate: 'Mittel (800–1600)',
    strong: 'Stark (ab 1600)',
  } satisfies Record<BotGroupId, string>,
  recommended: 'Passt zu dir',
  botCardLabel: (name: string, elo: number, style: string) => `${name}, ${elo} Elo, ${style} – Partie einrichten`,
  fromPositionHint: 'Du willst eine bestimmte Stellung ausspielen?',
  fromPositionLink: 'Aus Stellung spielen',
  loading: 'Wird geladen …',

  // --- setup
  setupTitle: (name: string) => `Partie gegen ${name}`,
  setupDescription: (elo: number, style: string) => `${elo} Elo · ${style}`,
  opponentLabel: 'Gegner',
  levelLabel: 'Hilfe-Stufe',
  levels: { competition: 'Wettkampf', training: 'Training', coach: 'Coach' } satisfies Record<AssistanceLevel, string>,
  levelDescriptions: {
    competition: 'Keine Hilfen. Zählt für dein Bot-Rating.',
    training: 'Zurücknehmen, Hinweise und Bewertungsbalken. Zählt nicht fürs Rating.',
    coach: 'Wie Training – dazu warnt dich der Coach vor groben Fehlern und lobt starke Züge.',
  } satisfies Record<AssistanceLevel, string>,
  ratedYes: 'Zählt fürs Bot-Rating: ja',
  ratedNo: 'Zählt fürs Bot-Rating: nein',
  colorLabel: 'Farbe',
  colors: { w: 'Weiß', random: 'Zufall', b: 'Schwarz' },
  noClock: 'Ohne Uhr – du hast so viel Zeit, wie du brauchst.',
  start: 'Partie starten',
  startError: 'Die Partie konnte nicht gestartet werden. Versuch es nochmal.',
  customPositionUnrated: 'Partien aus einer eigenen Stellung zählen nicht fürs Bot-Rating.',

  // --- play from position
  fenLabel: 'FEN der Stellung',
  fenPlaceholder: 'z. B. rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  fenHelp: 'Füge die FEN einer Stellung ein, zum Beispiel aus dem Analysebrett.',
  fenLoad: 'Stellung laden',
  fenInvalid: (reason: string) => `Diese Stellung geht nicht: ${reason}`,
  fenEmpty: 'Bitte gib eine FEN ein.',
  fenGameOver: 'In dieser Stellung ist die Partie schon zu Ende.',
  positionToMove: (c: 'w' | 'b') => `${sideDe(c)} ist am Zug.`,
  otherPosition: 'Andere Stellung',
  previewLabel: 'Vorschau der Stellung',

  // --- game screen
  gameTitle: (bot: string) => `Partie gegen ${bot}`,
  you: 'Du',
  thinking: (name: string) => `${name} überlegt …`,
  gameStart: (c: 'w' | 'b', bot: string, elo: number) => `Du spielst ${sideDe(c)} gegen ${bot} (${elo}).`,
  yourTurn: 'Du bist am Zug.',
  botTurn: (bot: string) => `${bot} ist am Zug.`,
  inCheck: 'Schach! Dein König wird angegriffen.',
  evalLabel: (text: string) => `Bewertung ${text}`,
  tabCoach: 'Coach',
  tabMoves: 'Züge',
  panelTabs: 'Partie-Ansicht',
  noMovesYet: 'Noch keine Züge.',
  takeback: 'Zurücknehmen',
  hint: 'Hinweis',
  hintMore: 'Noch ein Hinweis',
  hintPiece: (piece: string, square: string) => `Schau dir ${piece} auf ${square} an.`,
  hintMove: (san: string) => `Der beste Zug ist ${san}.`,
  hintLoading: 'Der Hinweis wird berechnet …',
  hintFailed: 'Gerade gibt es keinen Hinweis. Versuch es gleich nochmal.',
  resign: 'Aufgeben',
  claimDraw: 'Remis beantragen',
  moreActions: 'Partie-Aktionen',
  analyse: 'Analyse ansehen',
  rematch: 'Revanche',
  newGame: 'Neue Partie',
  backToList: 'Zur Bot-Liste',
  materialLead: (n: number) => `+${n}`,
  capturedLabel: (side: string) => `Geschlagene Figuren von ${side}`,
  levelChip: (level: string) => `Hilfe-Stufe: ${level}`,

  // --- coach
  coachName: 'Coach',
  coachIntro: 'Ich schaue dir über die Schulter. Vor groben Fehlern warne ich dich.',
  trainingIntro: 'Du kannst Züge zurücknehmen und dir Hinweise holen.',
  warningLead: 'Bist du sicher?',
  warningRethink: 'Nochmal überlegen',
  warningPlayAnyway: 'Trotzdem ziehen',
  threatLead: 'Achtung:',
  praiseLead: 'Starker Zug!',
  coachReady: 'Coach bereit',

  // --- move confirmation
  confirmTitle: 'Zug bestätigen',
  confirmText: (san: string) => `Möchtest du ${san} spielen?`,
  confirmPlay: 'Zug spielen',
  confirmCancel: 'Abbrechen',

  // --- draw claims (RULES §5.2, finding R-03)
  claimThreefold: 'Diese Stellung ist jetzt mindestens zum dritten Mal entstanden. Du kannst Remis beantragen.',
  claimFifty: 'Jede Seite hat 50 Züge lang keinen Bauern gezogen und keine Figur geschlagen. Du kannst Remis beantragen.',
  claimWithMoveThreefold: 'Mit deinem Zug ist diese Stellung mindestens zum dritten Mal entstanden. Du kannst jetzt Remis beantragen.',
  claimWithMoveFifty: 'Mit deinem Zug hat jede Seite 50 Züge lang keinen Bauern gezogen und keine Figur geschlagen. Du kannst jetzt Remis beantragen.',
  claimContinue: 'Weiterspielen',

  // --- resign
  resignTitle: 'Partie wirklich aufgeben?',
  resignConfirm: 'Aufgeben',
  resignCancel: 'Weiterspielen',

  // --- result
  resultTitleWin: 'Gewonnen',
  resultTitleLoss: 'Verloren',
  resultTitleDraw: 'Remis',
  ratingLine: (rating: number) => `Bot-Rating ${rating}`,
  unratedLine: 'Diese Partie zählt nicht fürs Bot-Rating.',
  end: {
    checkmateWin: 'Schachmatt – du hast gewonnen!',
    checkmateLoss: (bot: string) => `Schachmatt – ${bot} gewinnt.`,
    stalemate: 'Patt – Remis. Wer am Zug ist, hat keinen legalen Zug, steht aber nicht im Schach.',
    insufficient: 'Remis: Keine Seite kann mehr mattsetzen.',
    fivefold: 'Remis durch fünfmalige Stellungswiederholung.',
    seventyFive: 'Remis nach der 75-Züge-Regel.',
    threefoldUser: 'Remis durch dreimalige Stellungswiederholung – du hast Remis beantragt.',
    threefoldBot: (bot: string) => `Remis durch dreimalige Stellungswiederholung – ${bot} hat Remis beantragt.`,
    fiftyUser: 'Remis nach der 50-Züge-Regel – du hast Remis beantragt.',
    fiftyBot: (bot: string) => `Remis nach der 50-Züge-Regel – ${bot} hat Remis beantragt.`,
    resigned: 'Du hast aufgegeben.',
    resignedDraw: (bot: string) => `Remis: Du hast aufgegeben, aber ${bot} kann dich nicht mehr mattsetzen.`,
    aborted: 'Die Partie wurde abgebrochen.',
    timeout: 'Die Zeit ist abgelaufen.',
  },

  // --- two devices (P0-02, DESIGN §9.2)
  takeoverTitle: 'Partie läuft auf einem anderen Gerät – hier übernehmen?',
  takeoverText: 'Du kannst hier weiterspielen. Auf dem anderen Gerät kannst du dann nur noch zuschauen.',
  takeoverConfirm: 'Hier übernehmen',
  takeoverCancel: 'Abbrechen',
  readOnlyBanner: 'Diese Partie läuft auf einem anderen Gerät. Hier kannst du nur zuschauen.',
  takenOverBanner: 'Du spielst diese Partie jetzt auf einem anderen Gerät weiter. Hier kannst du nur noch zuschauen.',

  // --- errors / empty
  missingTitle: 'Partie nicht gefunden',
  missingText: 'Diese Partie gibt es hier nicht (mehr). Starte eine neue Partie.',
  loadError: 'Die Partie konnte nicht geladen werden.',
  botError: 'Der Bot konnte keinen Zug finden.',
  saveError: 'Der Zug konnte nicht gespeichert werden. Versuch es nochmal.',
  retry: 'Erneut versuchen',
} as const;

/** German side name. */
export function sideNameDe(c: 'w' | 'b'): string {
  return sideDe(c);
}

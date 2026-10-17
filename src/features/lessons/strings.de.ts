/**
 * German strings of the lesson pages (D-35): Lernpfad, course page, lesson player and end screen. The learner is
 * addressed with "du". Texts produced by the domain logic (stage names, hint sentences) live in `@/lessons`.
 */
import type { StageOpenReason } from '@/lessons';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const STRINGS_DE = {
  learn: 'Lernpfad',
  course: 'Kurs',
  lesson: 'Lektion',

  // Lernpfad
  learnSubtitle: 'Vom ersten Zug bis zum Turnierspieler – Schritt für Schritt.',
  loading: 'Lektionen werden geladen …',
  nextLesson: 'Nächste Lektion',
  nextLessonTitle: 'Weiter im Lernpfad',
  continueAt: (step: number, total: number) => `Weiter bei Schritt ${step} von ${total}`,
  startLesson: 'Lektion starten',
  continueLesson: 'Weitermachen',
  startTest: 'Test starten',
  allDone: 'Du hast alle freigeschalteten Lektionen abgeschlossen. Neue Kurse folgen bald.',
  stageOpen: 'Offen',
  stageLocked: 'Gesperrt',
  stageCompleted: 'Abgeschlossen',
  planned: 'in Vorbereitung',
  plannedStage: 'Diese Stufe ist in Vorbereitung.',
  stageReason: {
    always: '',
    self_assessment: 'Freigeschaltet durch deine Selbsteinschätzung.',
    skip_test: 'Freigeschaltet durch den Einstufungstest.',
    previous_completed: 'Freigeschaltet, weil du die vorige Stufe abgeschlossen hast.',
  } satisfies Record<StageOpenReason, string>,
  stageLockedText: (stage: number) =>
    stage === 1
      ? 'Schließe Stufe 0 ab oder bestehe den Einstufungstest, um Stufe 1 freizuschalten.'
      : `Schließe Stufe ${stage - 1} ab, um diese Stufe freizuschalten.`,
  lessonsDone: (done: number, total: number) => `${done} von ${total} ${plural(total, 'Lektion', 'Lektionen')}`,
  starsEarned: (earned: number, max: number) => `${earned} von ${max} Sternen`,
  courseProgress: (title: string) => `Fortschritt im Kurs ${title}`,
  courseCompleted: 'Kurs abgeschlossen',
  courseLocked: 'Gesperrt',
  openCourse: (title: string) => `Kurs ${title} öffnen`,

  // Skip test
  skipTitle: 'Du kennst die Regeln schon?',
  skipText: 'Mach den kurzen Einstufungstest. Bestehst du ihn, startest du direkt in Stufe 1.',
  skipStart: 'Einstufungstest starten',
  skipPassed: 'Einstufungstest bestanden – Stufe 1 ist freigeschaltet.',

  // Content errors (development)
  contentErrorsTitle: 'Fehler im Lektionsinhalt (nur in der Entwicklung sichtbar)',
  contentErrorsMore: (n: number) => `… und ${n} weitere`,

  // Course page
  courseNotFound: 'Kurs nicht gefunden',
  courseNotFoundText: 'Diesen Kurs gibt es nicht (mehr). Im Lernpfad findest du alle Kurse.',
  toLearnPath: 'Zum Lernpfad',
  coursePlannedText: 'Dieser Kurs ist in Vorbereitung. Schau bald wieder vorbei.',
  courseTest: 'Kurstest',
  courseTestLocked: 'Schließe zuerst alle Lektionen ab.',
  testScore: (percent: string) => `Bestes Ergebnis: ${percent}`,
  lessonLocked: (title: string) => `Schließe zuerst „${title}“ ab.`,
  lessonLockedShort: 'Schließe zuerst die vorige Lektion ab.',
  lessonNumber: (n: number) => `Lektion ${n}`,
  lessonUnavailable: 'Diese Lektion ist gerade nicht verfügbar.',
  statusNew: 'Neu',
  statusStarted: (step: number, total: number) => `Schritt ${step} von ${total}`,
  statusCompleted: 'Abgeschlossen',

  // Lesson page states
  lessonNotFound: 'Lektion nicht gefunden',
  lessonNotFoundText: 'Diese Lektion gibt es nicht oder sie ist gerade nicht verfügbar.',
  lessonInvalidDev: (file: string, message: string) => `${file}: ${message}`,
  lessonLockedTitle: 'Diese Lektion ist noch gesperrt',
  toCourse: 'Zum Kurs',
  toRequired: 'Zur vorigen Lektion',

  // Player
  stepOf: (n: number, total: number) => `Schritt ${n} von ${total}`,
  stepProgress: 'Fortschritt in der Lektion',
  next: 'Weiter',
  finish: 'Abschließen',
  prev: 'Zurück',
  resumed: (step: number) => `Du machst bei Schritt ${step} weiter.`,
  restart: 'Von vorn beginnen',
  playPosition: 'Diese Stellung gegen Bot spielen',
  flip: 'Brett drehen',
  testBadge: 'Test',
  reviewNotice: 'Du schaust dir einen erledigten Schritt an.',

  // Demo
  demoMove: (n: number, total: number, san: string) => `Zug ${n} von ${total}: ${san}`,
  demoStart: 'Ausgangsstellung',
  autoplay: 'Abspielen',
  pause: 'Pause',

  // Find the move
  correct: 'Richtig!',
  mate: 'Schachmatt – richtig!',
  wrong: 'Nicht ganz. Versuch es nochmal.',
  opponentThinking: 'Dein Gegner antwortet …',
  solved: 'Gelöst!',
  hint: 'Hinweis',
  hintMore: 'Weiterer Hinweis',
  noMoreHints: 'Keine weiteren Hinweise',

  // Quiz
  quizLabel: 'Antworten',
  quizCorrect: 'Richtig!',
  quizWrong: 'Leider falsch. Versuch es nochmal.',

  // Play out
  movesLeft: (n: number) => (n === 1 ? 'Noch 1 Zug' : `Noch ${n} Züge`),
  playOutYourTurn: 'Du bist am Zug.',
  botThinking: 'Der Bot überlegt …',
  botError: 'Der Bot konnte nicht ziehen.',
  retry: 'Nochmal versuchen',
  goal: { checkmate: 'Ziel: Setze matt.', promote: 'Ziel: Wandle einen Bauern um.', draw: 'Ziel: Halte das Remis.' },
  playingAgainst: (name: string) => `Gegner: ${name}`,

  // End screen
  endTitle: 'Lektion geschafft!',
  endStars: (stars: number) => `${stars} von 3 Sternen`,
  endSummary: (mistakes: number, hints: number) =>
    mistakes === 0 && hints === 0
      ? 'Ohne Fehler und ohne Hinweise – perfekt!'
      : `${mistakes} ${plural(mistakes, 'Fehler', 'Fehler')} · ${hints} ${plural(hints, 'Hinweis', 'Hinweise')}`,
  bestStars: (stars: number) => `Dein bestes Ergebnis: ${stars} von 3 Sternen`,
  nextLessonButton: 'Nächste Lektion',
  toCourseTest: 'Zum Kurstest',
  backToCourse: 'Zurück zum Kurs',
  repeatLesson: 'Lektion wiederholen',
  practiceTitle: 'Weiter üben',
  matchingPuzzles: 'Passende Puzzles',
  matchingPuzzlesTheme: (label: string) => `Passende Puzzles: ${label}`,
  practiceGame: (name: string, elo: number) => `Übungspartie gegen ${name} (${elo})`,
  practiceGameError: 'Die Übungspartie konnte nicht gestartet werden.',
  testPassedTitle: 'Test bestanden!',
  testFailedTitle: 'Noch nicht bestanden',
  testScoreLine: (correct: number, total: number, percent: string) => `${correct} von ${total} Aufgaben auf Anhieb richtig (${percent})`,
  testThreshold: (percent: string) => `Zum Bestehen brauchst du ${percent}.`,
  testFailedText: 'Schau dir die Lektionen noch einmal an und versuch es dann erneut.',
  courseDone: (title: string) => `Du hast den Kurs „${title}“ abgeschlossen.`,
  skipPassedText: 'Du startest direkt in Stufe 1 · Einsteiger.',
  skipFailedText: 'Kein Problem – Stufe 0 bringt dir die Regeln in Ruhe bei.',
  toStageOne: 'Zu Stufe 1',
  startStageZero: 'Mit Stufe 0 beginnen',
  retryTest: 'Test wiederholen',
} as const;

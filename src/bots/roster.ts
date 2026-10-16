/**
 * The bot roster (D-17, PRD "Bot-Liste"): 14 original bots from 100 to 2500 Elo, five of them below 800.
 * Names, personalities, chat lines and avatars (`public/avatars/bots/*.svg`) are our own – no chess.com names or images.
 *
 * Engines by strength (D-16): below 800 `stockfish-skill` (Skill Level 0–3 + rule-based gross errors), 800–2000
 * `stockfish-human` (human error model), 2100–2500 `stockfish-elo` (UCI_LimitStrength + UCI_Elo).
 * Repertoire lines are English SAN from the start position (both sides' moves); `scripts/validate/bots.ts` checks
 * that every line is legal and playable for the bot.
 */
import type { BotProfile } from '@/core/bots';

/** Public path of a bot avatar. */
export function botAvatarPath(id: string): string {
  return `/avatars/bots/${id}.svg`;
}

/** Avatar of the coach (Coach mode bubbles). */
export const COACH_AVATAR = '/avatars/bots/coach.svg';

/** All bots, sorted by Elo (ascending). */
export const BOT_ROSTER: BotProfile[] = [
  {
    id: 'pip',
    name: 'Pip',
    elo: 100,
    avatar: botAvatarPath('pip'),
    style: 'random',
    styleLabelDe: 'Verspielt',
    descriptionDe: 'Pip hat gerade erst gelernt, wie die Figuren ziehen. Er probiert gern alles aus und vergisst dabei oft seine Figuren.',
    engine: 'stockfish-skill',
    repertoire: {
      white: [['e4', 'e5', 'Qh5'], ['a4'], ['h4']],
      black: [['e4', 'a6'], ['d4', 'h6']],
    },
    chat: {
      greeting: ['Hallo! Ich bin Pip. Ich weiß schon, wie das Pferdchen springt!', 'Juhu, eine Partie! Los geht’s.'],
      onCapture: ['Hab ich! Hab ich!', 'Oh, die darf ich nehmen?'],
      onCheck: ['Schach! Das wollte ich schon immer mal sagen.', 'Schach! Hihi.'],
      onWin: ['Ich hab gewonnen? Echt jetzt?', 'Wow, das war Glück!'],
      onLoss: ['Du bist echt gut. Noch mal?', 'Mist, mein König! Gut gespielt.'],
      onDraw: ['Unentschieden – das zählt auch ein bisschen!', 'Remis! Keiner hat verloren.'],
    },
  },
  {
    id: 'lotte',
    name: 'Lotte',
    elo: 250,
    avatar: botAvatarPath('lotte'),
    style: 'cautious',
    styleLabelDe: 'Vorsichtig',
    descriptionDe: 'Lotte zieht am liebsten mit ihren Bauern und wagt sich selten nach vorn. Manchmal übersieht sie, dass eine Figur angegriffen wird.',
    engine: 'stockfish-skill',
    repertoire: {
      white: [['e3'], ['d3', 'd5', 'c3'], ['a3', 'e5', 'h3']],
      black: [['e4', 'e6', 'd4', 'd6'], ['d4', 'd6']],
    },
    chat: {
      greeting: ['Hallo. Ich spiele lieber vorsichtig.', 'Schön, dass du da bist. Langsam und sicher, ja?'],
      onCapture: ['Oh, entschuldige.', 'Die nehme ich mal lieber.'],
      onCheck: ['Schach … ist das schlimm?', 'Pass auf deinen König auf.'],
      onWin: ['Oh! Ich habe gewonnen.', 'Das hätte ich nicht gedacht.'],
      onLoss: ['Gut gemacht. Ich war wohl zu vorsichtig.', 'Glückwunsch! Das war schön gespielt.'],
      onDraw: ['Remis – das ist doch fair.', 'Unentschieden. Damit bin ich zufrieden.'],
    },
  },
  {
    id: 'emil',
    name: 'Emil',
    elo: 400,
    avatar: botAvatarPath('emil'),
    style: 'aggressive',
    styleLabelDe: 'Angriffslustig',
    descriptionDe: 'Emil holt seine Dame früh heraus und will schnell mattsetzen. Wer ruhig verteidigt, kann ihm Figuren abnehmen.',
    engine: 'stockfish-skill',
    repertoire: {
      white: [['e4', 'e5', 'Qh5', 'Nc6', 'Bc4'], ['e4', 'e5', 'Bc4', 'Nc6', 'Qf3']],
      black: [['e4', 'e5', 'Nf3', 'Qf6'], ['d4', 'e5']],
    },
    chat: {
      greeting: ['Ich greife sofort an. Bist du bereit?', 'Meine Dame ist schon ganz ungeduldig!'],
      onCapture: ['Zack, weg damit!', 'Die gehört jetzt mir.'],
      onCheck: ['Schach! Lauf, König, lauf!', 'Schach! Gleich ist es so weit.'],
      onWin: ['Angriff ist die beste Verteidigung!', 'Ha! Mein Angriff hat geklappt.'],
      onLoss: ['Hm, zu schnell angegriffen. Respekt!', 'Du hast meinen Angriff gestoppt. Stark.'],
      onDraw: ['Remis? Ich wollte doch angreifen!', 'Na gut, unentschieden.'],
    },
  },
  {
    id: 'greta',
    name: 'Greta',
    elo: 550,
    avatar: botAvatarPath('greta'),
    style: 'solid',
    styleLabelDe: 'Solide',
    descriptionDe: 'Greta baut ihre Stellung Schritt für Schritt auf. Sie macht weniger grobe Fehler als die Bots vor ihr – aber noch einige.',
    engine: 'stockfish-skill',
    repertoire: {
      white: [['d4', 'd5', 'Bf4'], ['d4', 'Nf6', 'Bf4']],
      black: [['e4', 'e5', 'Nf3', 'Nc6'], ['d4', 'd5', 'c4', 'e6']],
    },
    chat: {
      greeting: ['Hallo! Erst entwickeln, dann angreifen.', 'Auf eine ordentliche Partie.'],
      onCapture: ['Das war ein guter Tausch für mich.', 'Danke, die nehme ich.'],
      onCheck: ['Schach.', 'Schach – schau, wohin dein König kann.'],
      onWin: ['Schritt für Schritt zum Sieg.', 'Gut gespielt von uns beiden.'],
      onLoss: ['Glückwunsch, das war sauber.', 'Du warst heute besser.'],
      onDraw: ['Remis. Eine solide Partie.', 'Unentschieden – passt.'],
    },
  },
  {
    id: 'kalle',
    name: 'Kalle',
    elo: 700,
    avatar: botAvatarPath('kalle'),
    style: 'tactical',
    styleLabelDe: 'Fallensteller',
    descriptionDe: 'Kalle liebt kleine Fallen in der Eröffnung. Schau genau hin, bevor du eine Figur schlägst.',
    engine: 'stockfish-skill',
    repertoire: {
      white: [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3']],
      black: [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4'], ['d4', 'd5', 'c4', 'e5']],
    },
    chat: {
      greeting: ['Moin! Ich hab ein paar Tricks dabei.', 'Na, fällst du heute auf meine Fallen rein?'],
      onCapture: ['Hehe, gesehen?', 'Die stand ja einfach so da.'],
      onCheck: ['Schach! Überraschung!', 'Schach – hast du das kommen sehen?'],
      onWin: ['Falle zugeschnappt!', 'Ein Trick zu viel für dich.'],
      onLoss: ['Du hast meine Fallen alle gesehen. Stark!', 'Mist, durchschaut. Glückwunsch!'],
      onDraw: ['Remis – keiner ist reingefallen.', 'Unentschieden. Nächstes Mal klappt meine Falle.'],
    },
  },
  {
    id: 'nina',
    name: 'Nina',
    elo: 850,
    avatar: botAvatarPath('nina'),
    style: 'positional',
    styleLabelDe: 'Geduldig',
    descriptionDe: 'Nina spielt ruhig und wartet auf deine Fehler. Gegen sie lernst du, deine Figuren sauber zu entwickeln.',
    engine: 'stockfish-human',
    repertoire: {
      white: [['c4', 'e5', 'Nc3', 'Nf6', 'g3'], ['Nf3', 'd5', 'g3']],
      black: [['e4', 'c6', 'd4', 'd5'], ['d4', 'Nf6', 'c4', 'e6']],
    },
    chat: {
      greeting: ['Hallo! Ich habe Zeit. Du auch?', 'Lass uns in Ruhe spielen.'],
      onCapture: ['Danke schön.', 'Das nehme ich gern.'],
      onCheck: ['Schach.', 'Schach – ganz ruhig.'],
      onWin: ['Geduld zahlt sich aus.', 'Gut gespielt – diesmal hatte ich Glück.'],
      onLoss: ['Sehr schön gespielt!', 'Glückwunsch, du warst geduldiger als ich.'],
      onDraw: ['Remis. Eine ruhige Partie.', 'Unentschieden, das war ausgeglichen.'],
    },
  },
  {
    id: 'theo',
    name: 'Theo',
    elo: 1000,
    avatar: botAvatarPath('theo'),
    style: 'gambit',
    styleLabelDe: 'Gambit-Fan',
    descriptionDe: 'Theo opfert gern einen Bauern für schnelle Entwicklung und Angriff. Nimm das Geschenk an – aber pass auf deinen König auf.',
    engine: 'stockfish-human',
    repertoire: {
      white: [['e4', 'e5', 'f4'], ['d4', 'd5', 'c4'], ['e4', 'c5', 'd4', 'cxd4', 'c3']],
      black: [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], ['d4', 'd5', 'c4', 'e5']],
    },
    chat: {
      greeting: ['Ein Bauer für den Angriff? Immer!', 'Hallo! Ich verschenke gern mal was.'],
      onCapture: ['Jetzt hole ich mir den Bauern zurück.', 'Geben und nehmen!'],
      onCheck: ['Schach! Mein Opfer zahlt sich aus.', 'Schach!'],
      onWin: ['Das Gambit hat sich gelohnt!', 'Angriff, Angriff, Sieg!'],
      onLoss: ['Du hast mein Geschenk gut verdaut. Glückwunsch!', 'Zu viel geopfert. Gut gespielt!'],
      onDraw: ['Remis – trotz Bauernopfer.', 'Unentschieden. Nächstes Mal opfere ich mehr!'],
    },
  },
  {
    id: 'frieda',
    name: 'Frieda',
    elo: 1200,
    avatar: botAvatarPath('frieda'),
    style: 'solid',
    styleLabelDe: 'Solide',
    descriptionDe: 'Frieda spielt klassische Eröffnungen und hält ihre Figuren gut zusammen. Sie verliert selten Material ohne Grund.',
    engine: 'stockfish-human',
    repertoire: {
      white: [['d4', 'd5', 'c4', 'e6', 'Nc3'], ['d4', 'Nf6', 'c4', 'e6', 'Nc3']],
      black: [['e4', 'e6', 'd4', 'd5'], ['d4', 'd5', 'c4', 'c6']],
    },
    chat: {
      greeting: ['Guten Tag. Auf eine gute Partie.', 'Hallo! Ich spiele klassisch.'],
      onCapture: ['Ein fairer Tausch.', 'Das war ungedeckt.'],
      onCheck: ['Schach.', 'Schach – dein König steht offen.'],
      onWin: ['Eine saubere Partie.', 'Danke für das Spiel.'],
      onLoss: ['Glückwunsch, das war stark.', 'Sehr gut gespielt, wirklich.'],
      onDraw: ['Remis – ein gerechtes Ergebnis.', 'Unentschieden. Gut verteidigt.'],
    },
  },
  {
    id: 'jonte',
    name: 'Jonte',
    elo: 1400,
    avatar: botAvatarPath('jonte'),
    style: 'aggressive',
    styleLabelDe: 'Angriffslustig',
    descriptionDe: 'Jonte sucht immer den Angriff auf deinen König. Wer seine Drohungen früh erkennt, hat gute Chancen.',
    engine: 'stockfish-human',
    repertoire: {
      white: [['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], ['e4', 'c5', 'Nf3', 'd6', 'd4']],
      black: [['e4', 'c5'], ['d4', 'Nf6', 'c4', 'g6']],
    },
    chat: {
      greeting: ['Na, wie sicher steht dein König heute?', 'Ich will Action auf dem Brett!'],
      onCapture: ['Weg damit.', 'Die war im Weg.'],
      onCheck: ['Schach! Und es geht weiter.', 'Schach! Spürst du den Druck?'],
      onWin: ['Der Angriff ist durchgekommen.', 'Matt am Königsflügel – mein Lieblingsmuster.'],
      onLoss: ['Gut verteidigt. Respekt!', 'Mein Angriff war zu wild. Glückwunsch!'],
      onDraw: ['Remis. Zu viel Verteidigung für mich.', 'Unentschieden – nächstes Mal greife ich früher an.'],
    },
  },
  {
    id: 'ida',
    name: 'Ida',
    elo: 1600,
    avatar: botAvatarPath('ida'),
    style: 'endgame',
    styleLabelDe: 'Endspiel-Profi',
    descriptionDe: 'Ida tauscht gern Figuren und gewinnt dann das Endspiel. Kleine Vorteile reichen ihr.',
    engine: 'stockfish-human',
    repertoire: {
      white: [['d4', 'd5', 'c4', 'c6', 'Nf3'], ['c4', 'Nf6', 'Nc3', 'e5', 'Nf3']],
      black: [['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6']],
    },
    chat: {
      greeting: ['Hallo! Mal sehen, wer im Endspiel besser ist.', 'Ich tausche gern. Du auch?'],
      onCapture: ['Ein Tausch weniger bis zum Endspiel.', 'Danke.'],
      onCheck: ['Schach.', 'Schach – der König muss mitspielen.'],
      onWin: ['Im Endspiel zählt jeder Bauer.', 'Ein kleiner Vorteil hat gereicht.'],
      onLoss: ['Stark gespielt, auch im Endspiel!', 'Glückwunsch, sehr präzise.'],
      onDraw: ['Remis – im Endspiel gab es nichts mehr zu holen.', 'Unentschieden, gut gehalten.'],
    },
  },
  {
    id: 'oskar',
    name: 'Oskar',
    elo: 1800,
    avatar: botAvatarPath('oskar'),
    style: 'tactical',
    styleLabelDe: 'Taktiker',
    descriptionDe: 'Oskar findet Gabeln, Fesselungen und Abzugsangriffe. Lass keine Figur ungedeckt stehen.',
    engine: 'stockfish-human',
    repertoire: {
      white: [['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'], ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4']],
      black: [['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7']],
    },
    chat: {
      greeting: ['Hallo! Ich rechne gern Varianten.', 'Auf eine scharfe Partie!'],
      onCapture: ['Taktik entscheidet.', 'Die hing.'],
      onCheck: ['Schach – und dann?', 'Schach! Rechne gut nach.'],
      onWin: ['Eine kleine Kombination hat gereicht.', 'Taktik schlägt Strategie – heute jedenfalls.'],
      onLoss: ['Du hast alles gesehen. Sehr stark!', 'Glückwunsch, deine Taktik war besser.'],
      onDraw: ['Remis. Beide haben gut gerechnet.', 'Unentschieden – keine Kombination ging durch.'],
    },
  },
  {
    id: 'henrike',
    name: 'Henrike',
    elo: 2000,
    avatar: botAvatarPath('henrike'),
    style: 'positional',
    styleLabelDe: 'Strategin',
    descriptionDe: 'Henrike plant langfristig und nutzt schwache Felder aus. Gegen sie zählt jeder Zug.',
    engine: 'stockfish-human',
    repertoire: {
      white: [['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'], ['Nf3', 'd5', 'd4', 'Nf6', 'c4']],
      black: [['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'], ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']],
    },
    chat: {
      greeting: ['Guten Tag. Ich habe einen Plan.', 'Schön, dass du da bist. Denk langfristig.'],
      onCapture: ['Das passt in meinen Plan.', 'Danke, das Feld gehört jetzt mir.'],
      onCheck: ['Schach.', 'Schach – deine Felder sind schwach.'],
      onWin: ['Der Plan ist aufgegangen.', 'Danke für die spannende Partie.'],
      onLoss: ['Sehr gut geplant. Glückwunsch!', 'Du hast meine Schwächen gefunden. Stark.'],
      onDraw: ['Remis – strategisch ausgeglichen.', 'Unentschieden. Eine gute Partie.'],
    },
  },
  {
    id: 'professor-kraus',
    name: 'Professor Kraus',
    elo: 2200,
    avatar: botAvatarPath('professor-kraus'),
    style: 'solid',
    styleLabelDe: 'Klassiker',
    descriptionDe: 'Professor Kraus hat die alten Meister studiert und spielt sehr genau. Fehler verzeiht er selten.',
    engine: 'stockfish-elo',
    repertoire: {
      white: [['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'], ['d4', 'd5', 'c4', 'e6', 'Nc3']],
      black: [['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], ['d4', 'd5', 'c4', 'e6']],
    },
    chat: {
      greeting: ['Guten Tag. Zeig mir, was du gelernt hast.', 'Willkommen. Die Klassiker lehren uns Geduld.'],
      onCapture: ['Wie bei Capablanca.', 'Ein lehrreicher Moment.'],
      onCheck: ['Schach.', 'Schach – wie verteidigst du das?'],
      onWin: ['Eine lehrreiche Partie. Schau sie dir in der Analyse an.', 'Vielen Dank für die Partie.'],
      onLoss: ['Ausgezeichnet gespielt! Meine Hochachtung.', 'Bravo – das war meisterhaft.'],
      onDraw: ['Remis. Ein würdiges Ergebnis.', 'Unentschieden – sauber verteidigt.'],
    },
  },
  {
    id: 'zora',
    name: 'Zora',
    elo: 2500,
    avatar: botAvatarPath('zora'),
    style: 'tactical',
    styleLabelDe: 'Kompromisslos',
    descriptionDe: 'Zora ist die stärkste Gegnerin hier. Sie spielt scharf, rechnet tief und lässt nichts aus.',
    engine: 'stockfish-elo',
    repertoire: {
      white: [
        ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3'],
        ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4'],
      ],
      black: [['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5']],
    },
    chat: {
      greeting: ['Viel Glück. Du wirst es brauchen.', 'Zeig mir, was du kannst.'],
      onCapture: ['Danke.', 'Das war zu erwarten.'],
      onCheck: ['Schach.', 'Schach. Siehst du, was kommt?'],
      onWin: ['Gute Partie. Lern aus der Analyse.', 'Das war’s. Danke fürs Spielen.'],
      onLoss: ['Unglaublich. Du hast mich geschlagen!', 'Respekt. Das gelingt nicht vielen.'],
      onDraw: ['Remis gegen mich – nicht schlecht.', 'Unentschieden. Beeindruckend.'],
    },
  },
];

/** Bot by id, or `undefined`. */
export function botById(id: string | null | undefined, roster: readonly BotProfile[] = BOT_ROSTER): BotProfile | undefined {
  return id ? roster.find((b) => b.id === id) : undefined;
}

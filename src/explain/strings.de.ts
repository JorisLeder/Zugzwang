/**
 * German building blocks of the rule-based explanations (D-35, DESIGN §8.3: ≤ 3 sentences, why before what, concrete
 * pieces and squares, no engine numbers, "du"). Moves are inserted as segments by the templates in `ruleBased.ts`.
 */
import type { MotifId } from '@/core/explain';

/** "Merke" sentences (transferable rule, sentence 3 of a mistake explanation). */
export const MERKE_DE: Partial<Record<MotifId | 'generic', string>> = {
  mate: 'Merke: Prüfe vor jedem Zug, welche Schachgebote dein Gegner danach hat.',
  mate_threat: 'Merke: Prüfe vor jedem Zug, welche Schachgebote dein Gegner danach hat.',
  back_rank: 'Merke: Ein Luftloch für den König schützt vor Matt auf der Grundreihe.',
  hanging_piece: 'Merke: Prüfe vor jedem Zug, welche deiner Figuren danach ungedeckt sind.',
  material_loss: 'Merke: Prüfe vor jedem Zug, welche deiner Figuren danach ungedeckt sind.',
  fork: 'Merke: Achte auf Felder, von denen aus eine gegnerische Figur zwei deiner Figuren angreifen kann.',
  pin: 'Merke: Steht eine Figur vor deinem König oder deiner Dame, kann sie gefesselt werden.',
  skewer: 'Merke: Stehen König oder Dame mit einer anderen Figur auf einer Linie, droht ein Spieß.',
  discovered_attack: 'Merke: Achte auf Linien, die sich öffnen, wenn eine gegnerische Figur wegzieht.',
  double_check: 'Merke: Bei einem Doppelschach hilft nur ein Königszug – achte auf offene Linien zu deinem König.',
  trapped_piece: 'Merke: Stell Figuren nicht auf Felder, von denen sie nicht mehr wegkommen.',
  promotion: 'Merke: Einen Freibauern kurz vor der Umwandlung musst du sofort aufhalten.',
  missed_win: 'Merke: Suche in jeder Stellung zuerst nach Schachgeboten, Schlagzügen und Drohungen.',
  generic: 'Merke: Prüfe vor jedem Zug die stärkste Antwort deines Gegners.',
};

/** One sentence per puzzle theme (Lichess keys). Each statement is true for every puzzle with that theme. */
export const PUZZLE_THEME_DE: Record<string, string> = {
  smotheredMate: 'Der König wird von seinen eigenen Figuren eingesperrt – ein ersticktes Matt.',
  backRankMate: 'Der König steht auf der Grundreihe und wird von seinen eigenen Figuren eingesperrt.',
  fork: 'Das Motiv ist eine Gabel: Eine Figur greift zwei gegnerische Figuren gleichzeitig an.',
  pin: 'Das Motiv ist eine Fesselung: Eine Figur kann nicht wegziehen, ohne eine wertvollere Figur dahinter preiszugeben.',
  skewer: 'Das Motiv ist ein Spieß: Eine wertvolle Figur muss ausweichen, und die Figur dahinter geht verloren.',
  discoveredAttack: 'Das Motiv ist ein Abzugsangriff: Eine Figur zieht weg und gibt die Linie für eine andere frei.',
  doubleCheck: 'Das Motiv ist ein Doppelschach: Zwei Figuren geben gleichzeitig Schach, und der König muss ziehen.',
  hangingPiece: 'Eine gegnerische Figur ist nicht ausreichend gedeckt – du kannst sie gewinnen.',
  trappedPiece: 'Eine gegnerische Figur ist gefangen und hat kein sicheres Feld mehr.',
  promotion: 'Ein Bauer kann umwandeln – das entscheidet oft die Partie.',
  advancedPawn: 'Ein weit vorgerückter Bauer ist der Schlüssel.',
  sacrifice: 'Ein Opfer ist der Schlüssel zur Lösung.',
  deflection: 'Eine gegnerische Figur wird von ihrer Aufgabe weggelenkt (Ablenkung).',
  attraction: 'Eine gegnerische Figur wird auf ein ungünstiges Feld gelockt (Hinlenkung).',
  clearance: 'Ein Feld oder eine Linie wird für eine andere Figur frei gemacht (Räumung).',
  interference: 'Eine Figur unterbricht die Verbindung zwischen gegnerischen Figuren.',
  xRayAttack: 'Eine Figur wirkt durch eine andere Figur hindurch (Röntgenangriff).',
  capturingDefender: 'Du schlägst die Figur, die eine andere deckt.',
  intermezzo: 'Ein Zwischenzug ist der Schlüssel.',
  zugzwang: 'Dein Gegner ist in Zugzwang: Jeder Zug verschlechtert seine Stellung.',
  exposedKing: 'Der gegnerische König steht ungeschützt.',
  kingsideAttack: 'Der Angriff richtet sich gegen den König am Königsflügel.',
  queensideAttack: 'Der Angriff richtet sich gegen den König am Damenflügel.',
  defensiveMove: 'Hier ist ein genauer Verteidigungszug gefragt.',
};

/** Order in which puzzle themes are explained (most specific first). */
export const PUZZLE_THEME_ORDER: readonly string[] = [
  'smotheredMate',
  'backRankMate',
  'doubleCheck',
  'fork',
  'skewer',
  'pin',
  'discoveredAttack',
  'trappedPiece',
  'hangingPiece',
  'capturingDefender',
  'deflection',
  'attraction',
  'clearance',
  'interference',
  'xRayAttack',
  'intermezzo',
  'zugzwang',
  'promotion',
  'advancedPawn',
  'sacrifice',
  'exposedKing',
  'kingsideAttack',
  'queensideAttack',
  'defensiveMove',
];

/** Lichess theme → motif id (for `ExplanationText.motifs`). */
export const THEME_MOTIF: Record<string, MotifId> = {
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discoveredAttack: 'discovered_attack',
  doubleCheck: 'double_check',
  hangingPiece: 'hanging_piece',
  trappedPiece: 'trapped_piece',
  promotion: 'promotion',
  backRankMate: 'back_rank',
  mate: 'mate',
};

/** Fallback when the facts contain no move at all. */
export const NO_FACTS_DE = 'Zu dieser Stellung gibt es keine genaueren Angaben der Engine.';

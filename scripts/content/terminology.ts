/**
 * Terminology and source rules for lesson texts (WP-07): forbidden English or non-DSB terms, required DSB terms per
 * lesson, sentence length, and the FIDE article numbers lesson `sources` may cite (FIDE Laws of Chess, in force
 * since 1 January 2023). Used by `scripts/validate/lessons.ts`.
 */

/** A forbidden pattern with the term to use instead. */
export interface ForbiddenTerm {
  re: RegExp;
  useDe: string;
}

/**
 * Terms that must not appear in German lesson texts. English chess words, colloquial or wrong German piece names,
 * non-DSB spellings of the draw rules and English figurine letters in moves (German notation: K D T L S, 0-0).
 */
export const FORBIDDEN_TERMS: readonly ForbiddenTerm[] = [
  { re: /\bstalemate\b/i, useDe: 'Patt' },
  { re: /\bcheck\s*-?\s*mate\b/i, useDe: 'Schachmatt / Matt' },
  { re: /\bcastl(e|es|ed|ing)\b/i, useDe: 'Rochade' },
  { re: /\bpromot(e|es|ed|ion|ing)\b/i, useDe: 'Umwandlung' },
  { re: /\b(draw|draws|drawn)\b/i, useDe: 'Remis' },
  { re: /\b(pawns?|knights?|bishops?|rooks?|queens?)\b/i, useDe: 'Bauer, Springer, Läufer, Turm, Dame' },
  { re: /\b(king|kings)\b/i, useDe: 'König' },
  { re: /\bPferd(e|chen)?\b/i, useDe: 'Springer' },
  { re: /\bKönigin\b/i, useDe: 'Dame' },
  { re: /\bBischof\b/i, useDe: 'Läufer' },
  { re: /\bBurg\b/i, useDe: 'Turm' },
  { re: /\bunentschieden\b/i, useDe: 'Remis' },
  { re: /\bdreifache\s+(Stellungs)?wiederholung/i, useDe: 'dreimalige Stellungswiederholung' },
  { re: /\b(50|fünfzig)[- ]Zug[- ]Regel\b|\bFünfzig-Züge-Regel\b|\b50 Züge Regel\b|\b50-Züge Regel\b/i, useDe: '50-Züge-Regel' },
  { re: /\b(75|fünfundsiebzig)[- ]Zug[- ]Regel\b|\b75 Züge Regel\b/i, useDe: '75-Züge-Regel' },
  { re: /\bO-O(-O)?\b/, useDe: '0-0 / 0-0-0 (mit Nullen)' },
  { re: /(^|[\s(„"])[NBRQ][a-h1-8]?x?[a-h][1-8](=[NBRQ])?[+#]?(?=$|[\s.,;:!?)“"–-])/, useDe: 'deutsche Figurenbuchstaben (S, L, T, D)' },
  { re: /=[NBRQ]\b/, useDe: 'deutsche Umwandlungsbuchstaben (=D, =T, =L, =S)' },
];

/** Lesson id → DSB terms the lesson must use (case-insensitive substring). */
export const REQUIRED_TERMS: Readonly<Record<string, readonly string[]>> = {
  'schach-und-abwehr': ['Schach'],
  schachmatt: ['Schachmatt'],
  patt: ['Patt', 'Remis'],
  'remis-regeln': ['Remis', 'dreimalige Stellungswiederholung', '50-Züge-Regel'],
  rochade: ['Rochade', '0-0', '0-0-0'],
  'en-passant': ['en passant', 'im Vorbeigehen'],
  umwandlung: ['Umwandlung'],
  notation: ['0-0'],
};

/** Words that mark a statement about the rules of chess; a lesson using them must cite FIDE articles. */
export const RULE_TERMS: readonly RegExp[] = [
  /\bRochade\b/i,
  /\ben passant\b/i,
  /\bim Vorbeigehen\b/i,
  /\bUmwandlung\b/i,
  /\bPatt\b/,
  /\bStellungswiederholung\b/i,
  /\b50-Züge-Regel\b/,
  /\b75-Züge-Regel\b/,
];

/** Maximum words per sentence before a warning. */
export const MAX_SENTENCE_WORDS = 22;

/**
 * FIDE Laws of Chess 2023 articles that sources may cite (checked against the official text: the basic rules of
 * play, Art. 1–5, the clock rule 6.9, recording moves 8.1, the drawn game 9 and Appendix C, the algebraic
 * notation). A citation of another number is reported so typos do not reach learners.
 */
export const KNOWN_FIDE_ARTICLES: ReadonlySet<string> = new Set([
  '1.1', '1.2', '1.3', '1.4', '1.4.1', '1.4.2', '1.5',
  '2.1', '2.2', '2.3', '2.4',
  '3.1', '3.1.1', '3.1.2', '3.1.3', '3.2', '3.3', '3.4', '3.5', '3.6',
  '3.7', '3.7.1', '3.7.2', '3.7.3', '3.7.4.1', '3.7.4.2', '3.7.5.1', '3.7.5.2', '3.7.5.3',
  '3.8', '3.8.1', '3.8.2', '3.8.2.1', '3.8.2.1.1', '3.8.2.1.2', '3.8.2.2', '3.8.2.2.1', '3.8.2.2.2',
  '3.9', '3.9.1', '3.9.2', '3.10', '3.10.1',
  '4.1', '4.2.1', '4.3', '4.3.1', '4.3.2', '4.3.3', '4.7',
  '5.1.1', '5.1.2', '5.2.1', '5.2.2', '5.2.3',
  '6.9',
  '8.1.1',
  '9.1.1', '9.2', '9.2.1', '9.2.2', '9.3', '9.3.1', '9.3.2', '9.6', '9.6.1', '9.6.2',
]);

/** A FIDE source line, e.g. "FIDE-Schachregeln 2023, Art. 3.8.2 (Rochade)" or "FIDE-Schachregeln 2023, Anhang C". */
export const FIDE_SOURCE_RE = /^FIDE-Schachregeln 2023, (Art\. \d+(\.\d+)*|Anhang C)\b/;

/** Article numbers cited in a source line. */
export function citedArticles(source: string): string[] {
  return [...source.matchAll(/Art\.\s*(\d+(?:\.\d+)*)/g)].map((m) => m[1]!);
}

/** Splits German text into sentences (".", "!", "?" or "…" followed by a space or the end). */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?…]+(?:[.!?…]+(?=\s|$)|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Number of words of a sentence (moves and numbers count as words). */
export function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
}

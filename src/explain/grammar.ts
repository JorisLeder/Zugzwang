/**
 * German grammar helpers for explanation templates: piece noun phrases with article/possessive and case, pronouns,
 * lists ("a, b und c"). Piece names follow the DSB terms (König, Dame, Turm, Läufer, Springer, Bauer).
 */
import type { PieceSymbol, PromotionPiece, Square } from '@/core/chess';
import { pieceNameDe } from '@/lib/chess';

/** Grammatical case used by the templates. */
export type Case = 'nom' | 'acc' | 'dat';

/** Determiner: definite article ("den Läufer"), possessive of "du" ("deinen Läufer") or indefinite ("einen Läufer"). */
export type Determiner = 'def' | 'poss' | 'indef';

const FEMININE: ReadonlySet<PieceSymbol> = new Set(['q']);

const DETERMINERS: Record<Determiner, Record<'m' | 'f', Record<Case, string>>> = {
  def: { m: { nom: 'der', acc: 'den', dat: 'dem' }, f: { nom: 'die', acc: 'die', dat: 'der' } },
  poss: { m: { nom: 'dein', acc: 'deinen', dat: 'deinem' }, f: { nom: 'deine', acc: 'deine', dat: 'deiner' } },
  indef: { m: { nom: 'ein', acc: 'einen', dat: 'einem' }, f: { nom: 'eine', acc: 'eine', dat: 'einer' } },
};

const gender = (piece: PieceSymbol): 'm' | 'f' => (FEMININE.has(piece) ? 'f' : 'm');

/** Piece noun in a case ("Bauer" is a weak noun: "den Bauern"). */
export function pieceNoun(piece: PieceSymbol, kase: Case): string {
  const name = pieceNameDe(piece);
  return piece === 'p' && kase !== 'nom' ? `${name}n` : name;
}

/** Noun phrase: "den Läufer auf c4", "deine Dame auf d1", "den König" (the king without square). */
export function pieceNp(p: { piece: PieceSymbol; square?: Square }, kase: Case, det: Determiner): string {
  const article = DETERMINERS[det][gender(p.piece)][kase];
  const where = p.square && p.piece !== 'k' ? ` auf ${p.square}` : '';
  return `${article} ${pieceNoun(p.piece, kase)}${where}`;
}

/** Personal pronoun for a piece: er/ihn/ihm (masculine) or sie/sie/ihr (Dame). */
export function piecePronoun(piece: PieceSymbol, kase: Case): string {
  if (gender(piece) === 'f') return kase === 'dat' ? 'ihr' : 'sie';
  return { nom: 'er', acc: 'ihn', dat: 'ihm' }[kase];
}

/** "in eine Dame" / "in einen Turm" (promotion target, accusative). */
export function promotionPhrase(piece: PromotionPiece): string {
  return `in ${DETERMINERS.indef[gender(piece)].acc} ${pieceNameDe(piece)}`;
}

/** German list: "a", "a und b", "a, b und c". */
export function listDe(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/** Upper-cases the first letter (sentence start after a colon). */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** German name of a side: Weiß / Schwarz. */
export function sideName(color: 'w' | 'b'): string {
  return color === 'w' ? 'Weiß' : 'Schwarz';
}

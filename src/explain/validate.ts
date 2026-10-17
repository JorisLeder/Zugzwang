/**
 * Validator for LLM explanations (PRD Analyse-Pipeline step 5, P0-11, D-19): an explanation may only name moves the
 * engine confirmed. A text is accepted only if
 * 1. every move segment is a move of the facts – the played move, the best move or a move of `bestLine` /
 *    `refutation` – and legal at its place in that line (the lines are replayed with chess.js from their start
 *    position, see `lines.ts`; a SAN is matched by the move it denotes in that position, so `Dh5`/`Qh5+` both match),
 * 2. no text segment contains a move-like token that is not marked as a move (e.g. "Sf3", "Lxc4", "0-0"), and no
 *    leftover `[[…]]` markers (the server marks moves as `[[SAN]]`, D-19; markers inside text are converted first),
 * 3. it has 1–3 sentences and at most `MAX_EXPLANATION_CHARS` characters.
 * Accepted move segments are rewritten to the canonical English SAN of the fact move.
 */
import type { Fen, San, Uci } from '@/core/chess';
import type { ExplanationFacts, ExplanationSegment } from '@/core/explain';
import { sanToUci } from '@/lib/chess';
import { replayFactLines } from './lines';
import { countSentences, normalizeSegments, plainText } from './segments';

/** Upper bound of an explanation's plain text (3 sentences ≈ 360 characters, DESIGN §8.3, plus a margin). */
export const MAX_EXPLANATION_CHARS = 480;

/** Validation result. */
export type ValidationResult =
  | { ok: true; segments: ExplanationSegment[] }
  | { ok: false; reason: 'empty' | 'move_not_in_facts' | 'unmarked_move' | 'marker' | 'too_long' | 'too_many_sentences' };

/** A move of the facts at its place in a line. */
interface FactMove {
  fen: Fen;
  uci: Uci;
  san: San;
}

/** All fact moves with the position they are played from. */
export function factMoves(facts: ExplanationFacts): FactMove[] {
  const lines = replayFactLines(facts);
  const out: FactMove[] = [];
  if (lines.played) out.push({ fen: lines.played.fenBefore, uci: lines.played.uci, san: lines.played.san });
  for (const r of [...lines.best, ...lines.refutation]) out.push({ fen: r.fenBefore, uci: r.uci, san: r.san });
  return out;
}

/** Splits `[[SAN]]` markers inside text segments into move segments. */
export function splitMarkers(segments: readonly ExplanationSegment[]): ExplanationSegment[] {
  const out: ExplanationSegment[] = [];
  for (const s of segments) {
    if (s.type !== 'text') {
      out.push({ type: 'move', san: s.san.trim() });
      continue;
    }
    const re = /\[\[([^[\]]{1,12})\]\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s.text))) {
      if (m.index > last) out.push({ type: 'text', text: s.text.slice(last, m.index) });
      out.push({ type: 'move', san: m[1]!.trim() });
      last = m.index + m[0].length;
    }
    if (last < s.text.length) out.push({ type: 'text', text: s.text.slice(last) });
  }
  return out;
}

/**
 * Move-like tokens in prose: piece moves with English or German letters ("Nf3", "Sxe5", "Dh5+", "Tad1"), pawn
 * captures ("exd5") and castling ("O-O", "0-0-0"). Plain squares ("e4", "auf c4") are allowed.
 */
const MOVE_LIKE =
  /(?<![\p{L}\d])(?:[KQRBNDTLS][a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBNDTLS])?[+#]?|[a-h]x[a-h][1-8](?:=?[QRBNDTLS])?[+#]?|[O0]-[O0](?:-[O0])?[+#]?)(?![\p{L}\d])/u;

/** Validates LLM segments against the facts (see the file header). */
export function validateExplanationSegments(segments: readonly ExplanationSegment[], facts: ExplanationFacts): ValidationResult {
  const split = normalizeSegments(splitMarkers(segments));
  if (!split.some((s) => s.type === 'text' && s.text.trim().length > 0)) return { ok: false, reason: 'empty' };
  const candidates = factMoves(facts);
  const out: ExplanationSegment[] = [];
  for (const s of split) {
    if (s.type === 'text') {
      if (s.text.includes('[[') || s.text.includes(']]')) return { ok: false, reason: 'marker' };
      if (MOVE_LIKE.test(s.text)) return { ok: false, reason: 'unmarked_move' };
      out.push(s);
      continue;
    }
    const match = candidates.find((c) => sanToUci(c.fen, s.san) === c.uci);
    if (!match) return { ok: false, reason: 'move_not_in_facts' };
    out.push({ type: 'move', san: match.san });
  }
  const plain = plainText(out);
  if (plain.length > MAX_EXPLANATION_CHARS) return { ok: false, reason: 'too_long' };
  const n = countSentences(plain);
  if (n < 1 || n > 3) return { ok: false, reason: 'too_many_sentences' };
  return { ok: true, segments: out };
}

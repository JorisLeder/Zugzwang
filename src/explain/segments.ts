/**
 * Building and rendering explanation segments (D-19): text parts and moves (English SAN in data). `plain` is the
 * same text with moves in German notation (storage, search, text-to-speech – P2-06).
 */
import type { San } from '@/core/chess';
import type { ExplanationSegment, ExplanationText, MotifId } from '@/core/explain';
import { formatSan } from '@/lib/chess';

/** One sentence as segments. */
export type Sentence = ExplanationSegment[];

/** A part of a sentence: text, one move or a line of moves (separated by spaces). */
export type Part = string | { move: San } | { line: readonly San[] };

/** Move part. */
export const mv = (san: San): Part => ({ move: san });

/** Line part ("Sxd3+ Kh2 Sxc1"). */
export const ln = (sans: readonly San[]): Part => ({ line: sans });

/** Builds one sentence from parts (adjacent text is merged). */
export function sentence(...parts: Part[]): Sentence {
  const out: Sentence = [];
  const pushText = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last?.type === 'text') last.text += text;
    else out.push({ type: 'text', text });
  };
  for (const p of parts) {
    if (typeof p === 'string') pushText(p);
    else if ('move' in p) out.push({ type: 'move', san: p.move });
    else
      p.line.forEach((san, i) => {
        if (i > 0) pushText(' ');
        out.push({ type: 'move', san });
      });
  }
  return out;
}

/** Normalises segments: merges adjacent text, drops empty text. */
export function normalizeSegments(segments: readonly ExplanationSegment[]): ExplanationSegment[] {
  const out: ExplanationSegment[] = [];
  for (const s of segments) {
    if (s.type === 'text') {
      if (!s.text) continue;
      const last = out[out.length - 1];
      if (last?.type === 'text') last.text += s.text;
      else out.push({ type: 'text', text: s.text });
    } else {
      out.push({ type: 'move', san: s.san });
    }
  }
  return out;
}

/** Plain text of segments with moves in German notation (K D T L S, `0-0`). */
export function plainText(segments: readonly ExplanationSegment[]): string {
  return segments
    .map((s) => (s.type === 'text' ? s.text : formatSan(s.san, 'de')))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Joins sentences into an explanation. */
export function assemble(sentences: readonly Sentence[], source: ExplanationText['source'], motifs: readonly MotifId[]): ExplanationText {
  const segments: ExplanationSegment[] = [];
  sentences.forEach((s, i) => {
    if (i > 0) segments.push({ type: 'text', text: ' ' });
    segments.push(...s.map((seg) => ({ ...seg })));
  });
  const normalized = normalizeSegments(segments);
  return { plain: plainText(normalized), segments: normalized, source, motifs: [...new Set(motifs)] };
}

const ABBREVIATIONS = /\b(?:z\.\s?B\.|d\.\s?h\.|u\.\s?a\.|bzw\.|ca\.|evtl\.|ggf\.|usw\.|vgl\.|Nr\.)/gi;

/**
 * Number of sentences in a text (sentence ends: `.`, `!`, `?` followed by a space or the end; common German
 * abbreviations such as "z. B." do not end a sentence).
 */
export function countSentences(text: string): number {
  const t = text.replace(ABBREVIATIONS, 'ABK').trim();
  if (!t) return 0;
  const ends = t.match(/[.!?]+(?=\s|$)/g)?.length ?? 0;
  return /[.!?]$/.test(t) ? ends : ends + 1;
}

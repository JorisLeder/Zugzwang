/**
 * `FakeExplanationService` – returns the facts as short plain German text (no templates, no LLM).
 */
import { formatSan } from '@/lib/chess';
import type { ExplanationFacts, ExplanationSegment, ExplanationService, ExplanationText } from '../explain';

/** Fake explanations: "Gespielt: … Besser: …" built from the facts. */
export class FakeExplanationService implements ExplanationService {
  /** Facts passed to `explain`. */
  readonly requests: ExplanationFacts[] = [];

  explainRuleBased(facts: ExplanationFacts): ExplanationText {
    const segments: ExplanationSegment[] = [];
    if (facts.playedMove) segments.push({ type: 'text', text: 'Gespielt: ' }, { type: 'move', san: facts.playedMove.san }, { type: 'text', text: '. ' });
    if (facts.bestMove) segments.push({ type: 'text', text: 'Besser: ' }, { type: 'move', san: facts.bestMove.san }, { type: 'text', text: '.' });
    if (segments.length === 0) segments.push({ type: 'text', text: 'Keine Erklärung verfügbar.' });
    const plain = segments.map((s) => (s.type === 'text' ? s.text : formatSan(s.san, 'de'))).join('').trim();
    return { plain, segments, source: 'rule', motifs: facts.motifs.map((m) => m.id) };
  }

  async explain(facts: ExplanationFacts, opts: { allowLlm?: boolean; signal?: AbortSignal; cacheKey?: string } = {}): Promise<ExplanationText> {
    this.requests.push(facts);
    if (opts.signal?.aborted) throw new DOMException('Explanation aborted', 'AbortError');
    return this.explainRuleBased(facts);
  }
}

import type { Notation } from '@/core/chess';
import type { ExplanationText as Explanation } from '@/core/explain';
import { formatSan } from '@/lib/chess';

/** Renders explanation segments; moves (English SAN in data, D-19) appear in the user's notation, in bold. */
export function ExplanationText({ explanation, notation, testId }: { explanation: Explanation; notation: Notation; testId?: string }) {
  return (
    <span data-testid={testId} data-source={explanation.source}>
      {explanation.segments.map((s, i) =>
        s.type === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i} className="font-semibold">
            {formatSan(s.san, notation)}
          </span>
        ),
      )}
    </span>
  );
}

/** A line of moves ("Txf2 Sxd3+ Kh2") in the user's notation; each move is a separate token for screen readers. */
export function MoveLine({ sans, notation, testId }: { sans: readonly string[]; notation: Notation; testId?: string }) {
  return (
    <span data-testid={testId} className="font-semibold tabular-nums">
      {sans.map((san, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {formatSan(san, notation)}
        </span>
      ))}
    </span>
  );
}

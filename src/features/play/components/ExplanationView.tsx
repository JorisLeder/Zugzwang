import type { Notation } from '@/core/chess';
import type { ExplanationText } from '@/core/explain';
import { formatSan } from '@/lib/chess';

/** Renders an explanation; moves (English SAN in data, D-19) are shown in the user's notation. */
export function ExplanationView({ explanation, notation }: { explanation: ExplanationText; notation: Notation }) {
  return (
    <>
      {explanation.segments.map((s, i) =>
        s.type === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i} className="font-semibold">
            {formatSan(s.san, notation)}
          </span>
        ),
      )}
    </>
  );
}

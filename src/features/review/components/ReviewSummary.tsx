import { CLASSIFICATION_META, type GameAnalysis } from '@/core/analysis';
import type { Color, MoveRecord, Notation } from '@/core/chess';
import { formatSan } from '@/lib/chess';
import { ClassificationBadge } from '@/ui/primitives';
import { accuracyText, displayKeyMoments, moveNumberText, openingOf, summaryCategories, type PlayerInfo } from '../review';
import { STRINGS_DE } from '../strings.de';
import { EvalGraph } from './EvalGraph';

/** Props of `ReviewSummary`. */
export interface ReviewSummaryProps {
  analysis: GameAnalysis;
  moves: MoveRecord[];
  players: Record<Color, PlayerInfo>;
  ply: number;
  onSelectPly: (ply: number) => void;
  notation: Notation;
}

const SIDES: Color[] = ['w', 'b'];

/**
 * Summary of a game review (PRD §3): accuracy of both sides (0–100 %, one decimal), number of moves per category for
 * both sides, the eval graph and 3–5 key moments (buttons that jump to the move).
 */
export function ReviewSummary({ analysis, moves, players, ply, onSelectPly, notation }: ReviewSummaryProps) {
  const keyMoments = displayKeyMoments(analysis);
  const opening = openingOf(analysis);
  const sideName = (c: Color) => (c === 'w' ? STRINGS_DE.white : STRINGS_DE.black);
  return (
    <div className="flex flex-col gap-6" data-testid="review-summary">
      <section aria-labelledby="review-accuracy" className="flex flex-col gap-2">
        <h2 id="review-accuracy" className="text-body-sm font-medium text-muted">
          {STRINGS_DE.accuracyHeading}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {SIDES.map((c) => (
            <div key={c} className="rounded-md bg-surface-2 p-3" data-testid={`accuracy-${c}`}>
              <p className="truncate text-caption text-muted">
                {sideName(c)} · {players[c].name}
              </p>
              <p className="text-h2 text-text tabular-nums">{accuracyText(analysis.accuracy[c])}</p>
            </div>
          ))}
        </div>
        {opening && <p className="text-body-sm text-muted">{STRINGS_DE.opening(opening.name, opening.eco)}</p>}
      </section>

      <section aria-labelledby="review-graph" className="flex flex-col gap-2">
        <h2 id="review-graph" className="text-body-sm font-medium text-muted">
          {STRINGS_DE.graphHeading}
        </h2>
        <EvalGraph analysis={analysis} moves={moves} ply={ply} onSelectPly={onSelectPly} notation={notation} />
      </section>

      <section aria-labelledby="review-key-moments" className="flex flex-col gap-2">
        <h2 id="review-key-moments" className="text-body-sm font-medium text-muted">
          {STRINGS_DE.keyMomentsHeading}
        </h2>
        {keyMoments.length === 0 ? (
          <p className="text-body text-muted">{STRINGS_DE.noKeyMoments}</p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="key-moments">
            {keyMoments.map((p) => {
              const m = analysis.moves.find((x) => x.ply === p);
              const rec = moves[p - 1];
              if (!m || !rec) return null;
              return (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => onSelectPly(p)}
                    aria-current={p === ply ? 'step' : undefined}
                    className="focus-inset flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-surface-2 aria-[current=step]:bg-surface-3"
                  >
                    <ClassificationBadge classification={m.classification} />
                    <span className="text-move font-semibold text-text tabular-nums">{moveNumberText(rec, formatSan(rec.san, notation))}</span>
                    <span className="min-w-0 flex-1 truncate text-body-sm text-muted">
                      {CLASSIFICATION_META[m.classification].labelDe} · {sideName(m.color)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="review-counts" className="flex flex-col gap-2">
        <h2 id="review-counts" className="text-body-sm font-medium text-muted">
          {STRINGS_DE.countsHeading}
        </h2>
        <table className="w-full border-collapse text-body-sm tabular-nums" data-testid="classification-counts">
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="py-1 text-left font-medium">
                {STRINGS_DE.category}
              </th>
              {SIDES.map((c) => (
                <th key={c} scope="col" className="w-16 py-1 text-right font-medium">
                  {sideName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaryCategories(analysis).map((cls) => (
              <tr key={cls} className="border-b border-border/50" data-classification={cls}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  <ClassificationBadge classification={cls} showLabel showPlainTooltip />
                </th>
                {SIDES.map((c) => (
                  <td key={c} className="py-1.5 text-right text-text" data-testid={`count-${cls}-${c}`}>
                    {analysis.counts[c][cls]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

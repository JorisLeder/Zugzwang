import type { Fen, Notation, Uci } from '@/core/chess';
import { formatEval } from '@/i18n';
import { cn } from '@/lib/cn';
import { ErrorState, ProgressBar, Switch } from '@/ui/primitives';
import { formatEngineLine } from './analysisLine';
import { STRINGS_DE } from './strings.de';
import type { LiveEngineState } from './useLiveEngine';

/** Props of `EnginePanel`. */
export interface EnginePanelProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  engine: LiveEngineState;
  /** Shown position. */
  fen: Fen;
  /** No legal move in the shown position (game over). */
  gameOver: boolean;
  notation: Notation;
  /** Plays the first move of a line. */
  onPlayMove: (uci: Uci) => void;
}

/** Engine toggle and the top 2 lines with evaluation and depth (DESIGN §3.5, §5.12). */
export function EnginePanel({ enabled, onToggle, engine, fen, gameOver, notation, onPlayMove }: EnginePanelProps) {
  const { status, lines, done, error } = engine;
  const failed = enabled && (status.state === 'error' || error !== null);
  const loading = enabled && status.state === 'loading';
  return (
    <section className="flex flex-col gap-3" aria-label={STRINGS_DE.engineToggle}>
      <Switch checked={enabled} onCheckedChange={onToggle} label={STRINGS_DE.engineToggle} description={STRINGS_DE.engineToggleHint} />
      {loading && (
        <ProgressBar
          value={status.progress !== undefined ? Math.round(status.progress * 100) : undefined}
          label={status.progress !== undefined ? STRINGS_DE.engineLoadingPercent(Math.round(status.progress * 100)) : STRINGS_DE.engineLoading}
        />
      )}
      {failed && (
        <ErrorState
          message={STRINGS_DE.engineFailed}
          retryLabel={STRINGS_DE.engineReload}
          onRetry={() => {
            window.location.reload();
          }}
        />
      )}
      {enabled && !failed && (
        <div aria-live="polite" aria-busy={!done}>
          {lines.length > 0 ? (
            <ol aria-label={STRINGS_DE.engineLines} className="flex flex-col gap-2" data-testid="engine-lines">
              {lines.slice(0, 2).map((l) => {
                const { text, first } = formatEngineLine(fen, l, notation);
                const evalText = formatEval(l.score);
                return (
                  <li key={l.multipv}>
                    <button
                      type="button"
                      data-testid="engine-line"
                      disabled={!l.pv[0]}
                      aria-label={`${STRINGS_DE.evalLabel(evalText)}, ${STRINGS_DE.depth(l.depth)}: ${text}. ${first ? STRINGS_DE.playLine(first) : ''}`}
                      onClick={() => l.pv[0] && onPlayMove(l.pv[0])}
                      className="focus-inset flex w-full min-h-11 items-start gap-3 rounded-md bg-surface-2 px-3 py-2 text-left hover:bg-surface-3"
                    >
                      <span
                        className={cn(
                          'inline-flex h-6 min-w-14 shrink-0 items-center justify-center rounded-sm px-1.5 text-body-sm font-bold tabular-nums',
                          // White POV: the chip takes the colour of the side that is better.
                          l.score.value >= 0 ? 'bg-eval-white text-eval-black' : 'bg-eval-black text-eval-white',
                        )}
                      >
                        {evalText}
                      </span>
                      <span className="min-w-0 flex-1 text-move break-words text-text">{text}</span>
                      <span className="shrink-0 text-caption text-muted tabular-nums">{STRINGS_DE.depth(l.depth)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-body-sm text-muted">{gameOver ? STRINGS_DE.engineNoMoves : STRINGS_DE.engineThinking}</p>
          )}
        </div>
      )}
    </section>
  );
}

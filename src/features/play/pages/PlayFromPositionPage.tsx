import { useId, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { recommendBot } from '@/bots';
import type { AssistanceLevel } from '@/core/games';
import { useSubscribable } from '@/lib/observable';
import { Board } from '@/ui/board';
import { Page } from '@/ui/layout';
import { Button } from '@/ui/primitives';
import { SetupForm, type SetupChoice } from '../components/SetupForm';
import { checkPosition } from '../logic';
import { startBotGame } from '../startGame';
import { STRINGS_DE } from '../strings.de';

/** Aus Stellung spielen – `/play/position?fen=` (PRD "Aus Stellung spielen", P0-09 origin). */
export function Component() {
  const services = useServices();
  const { data, botRoster } = services;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fenParam = params.get('fen');
  const check = useMemo(() => checkPosition(fenParam), [fenParam]);
  const [input, setInput] = useState(fenParam ?? '');
  const [inputError, setInputError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const ratingSource = useMemo(() => data.repos.ratings.observe('bot'), [data]);
  const rating = useSubscribable(ratingSource, null);
  const recommended = botRoster.length ? recommendBot(rating?.rating ?? null, botRoster) : null;

  const load = (e: FormEvent) => {
    e.preventDefault();
    const result = checkPosition(input);
    if (!result?.ok) {
      setInputError(result?.error ?? STRINGS_DE.fenEmpty);
      return;
    }
    setInputError(null);
    void navigate(paths.playFromPosition(result.fen));
  };

  const start = async (choice: SetupChoice) => {
    if (!check?.ok) return;
    const game = await startBotGame(services, { ...choice, startFen: check.fen, origin: { type: 'fen' } });
    await navigate(paths.playGame(game.id));
  };

  const error = inputError ?? (check && !check.ok ? check.error : null);
  // Rating farming guard: games from a custom position are never rated (only Training and Coach are offered).
  const levels: AssistanceLevel[] = check?.ok && check.standard ? ['competition', 'training', 'coach'] : ['training', 'coach'];

  return (
    <Page title={STRINGS_DE.playFromPosition}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex w-full flex-col gap-4 lg:max-w-[420px]">
          <form onSubmit={load} className="flex flex-col gap-2" noValidate>
            <label htmlFor={inputId} className="text-body-sm font-medium text-text">
              {STRINGS_DE.fenLabel}
            </label>
            <p className="text-body-sm text-muted">{STRINGS_DE.fenHelp}</p>
            <textarea
              id={inputId}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              spellCheck={false}
              autoComplete="off"
              placeholder={STRINGS_DE.fenPlaceholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="w-full resize-y rounded-md border border-border-strong bg-surface-2 px-3 py-2 font-mono text-body-sm text-text placeholder:text-muted"
            />
            {error && (
              <p id={errorId} role="alert" data-testid="fen-error" className="text-body-sm text-danger-text">
                {error}
              </p>
            )}
            <div>
              <Button type="submit" variant={check?.ok ? 'secondary' : 'primary'}>
                {STRINGS_DE.fenLoad}
              </Button>
            </div>
          </form>
          {check?.ok && (
            <div className="flex flex-col gap-2">
              <div className="aspect-square w-full max-w-[360px]" aria-label={STRINGS_DE.previewLabel} role="group">
                <Board
                  fen={check.fen}
                  orientation={check.turn === 'w' ? 'white' : 'black'}
                  interactive={false}
                  allowUserArrows={false}
                  sound={false}
                  label={STRINGS_DE.previewLabel}
                />
              </div>
              <p className="text-body-sm text-muted">{STRINGS_DE.positionToMove(check.turn)}</p>
            </div>
          )}
        </div>
        {check?.ok && recommended && (
          <section aria-label={STRINGS_DE.opponentLabel} className="w-full lg:max-w-[480px]">
            <SetupForm
              key={check.fen}
              bots={botRoster}
              initialBotId={recommended.id}
              initialLevel="coach"
              initialColor={check.turn}
              levels={levels}
              showBotSelect
              note={check.standard ? undefined : STRINGS_DE.customPositionUnrated}
              onStart={start}
            />
          </section>
        )}
      </div>
    </Page>
  );
}

import { FileUp, LayoutGrid, Swords } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { recommendBot } from '@/bots';
import type { GameAnalysis } from '@/core/analysis';
import type { Game } from '@/core/games';
import { useSubscribable } from '@/lib/observable';
import { Page } from '@/ui/layout';
import { Badge, Button, Card, CardMeta, EmptyState } from '@/ui/primitives';
import { accuracyText, gameDateLabel, gameTitle, resultLabel } from '../review';
import { STRINGS_DE } from '../strings.de';

/** Games shown in the hub: finished bot games and every imported game. */
export function reviewableGames(games: readonly Game[]): Game[] {
  return games.filter((g) => (g.source === 'bot' ? g.status === 'finished' : true));
}

/**
 * Analyse – the learner's games (bot games and imported PGNs) with date, opponent, result and accuracy once analysed;
 * actions "PGN importieren" and "Analysebrett"; the empty state suggests a bot that fits the learner's rating.
 */
export function Component() {
  const services = useServices();
  const { data, botRoster } = services;
  data.activity.useTracking('analysis');
  const gamesSource = useMemo(() => data.repos.games.observeList(), [data]);
  const allGames = useSubscribable<Game[] | null>(gamesSource, null);
  const games = useMemo(() => (allGames ? reviewableGames(allGames) : null), [allGames]);
  const ratingSource = useMemo(() => data.repos.ratings.observe('bot'), [data]);
  const rating = useSubscribable(ratingSource, null);
  const [analyses, setAnalyses] = useState<Map<string, GameAnalysis>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    data.repos.gameAnalyses
      .list()
      .then((list) => !cancelled && setAnalyses(new Map(list.map((a) => [a.gameId, a]))))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data, allGames]);

  const recommended = useMemo(() => (botRoster.length ? recommendBot(rating?.rating ?? null, botRoster) : null), [botRoster, rating]);

  return (
    <Page
      title={STRINGS_DE.analysis}
      subtitle={STRINGS_DE.hubSubtitle}
      actions={
        <>
          <Button asChild>
            <Link to={paths.analysisImport()}>
              <FileUp aria-hidden="true" />
              {STRINGS_DE.importPgn}
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to={paths.analysisBoard()}>
              <LayoutGrid aria-hidden="true" />
              {STRINGS_DE.analysisBoard}
            </Link>
          </Button>
        </>
      }
    >
      {games === null ? null : games.length === 0 ? (
        <EmptyState
          icon={<Swords />}
          title={STRINGS_DE.emptyTitle}
          text={recommended ? STRINGS_DE.emptyText(recommended.name, recommended.elo) : STRINGS_DE.emptyTextNoBot}
          action={
            <Button asChild>
              <Link to={paths.play()}>{STRINGS_DE.startGame}</Link>
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="analysis-games" className="flex flex-col gap-3">
          <h2 id="analysis-games" className="text-h2 text-text">
            {STRINGS_DE.gamesHeading}
          </h2>
          <ul className="flex flex-col gap-3" aria-label={STRINGS_DE.gameListLabel} data-testid="analysis-games">
            {games.map((g) => (
              <li key={g.id}>
                <GameCard game={g} analysis={analyses.get(g.id) ?? null} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}

function GameCard({ game, analysis }: { game: Game; analysis: GameAnalysis | null }) {
  const { botRoster } = useServices();
  const title = gameTitle(game, botRoster);
  const date = gameDateLabel(game);
  const result = resultLabel(game);
  const userColor = game.source === 'bot' ? game.userColor : null;
  const accuracy = analysis
    ? userColor
      ? STRINGS_DE.accuracyShort(accuracyText(analysis.accuracy[userColor]))
      : STRINGS_DE.accuracyBoth(accuracyText(analysis.accuracy.w), accuracyText(analysis.accuracy.b))
    : STRINGS_DE.notAnalysed;
  const blunders = analysis ? (userColor ? analysis.counts[userColor].blunder : analysis.counts.w.blunder + analysis.counts.b.blunder) : 0;
  return (
    <Card interactive asChild>
      <Link to={paths.analysisGame(game.id)} data-game-id={game.id} data-source={game.source} aria-label={`${title}, ${result}${date ? `, ${date}` : ''}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-h3 text-text">{title}</p>
            <CardMeta>{[date, game.source === 'bot' ? STRINGS_DE.sourceBot : STRINGS_DE.sourcePgn].filter(Boolean).join(' · ')}</CardMeta>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={result === STRINGS_DE.resultWin ? 'accent' : result === STRINGS_DE.resultLoss ? 'danger' : 'neutral'} data-testid="game-result">
              {result}
            </Badge>
            <span className="text-body-sm text-muted tabular-nums" data-testid="game-accuracy">
              {accuracy}
            </span>
            {analysis && blunders > 0 && (
              <Badge tone="warning" className="tabular-nums">
                {STRINGS_DE.blunders(blunders)}
              </Badge>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}

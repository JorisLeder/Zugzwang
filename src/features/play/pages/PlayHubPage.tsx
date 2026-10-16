import { Crosshair, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { botGroup, recommendBot, type BotGroupId } from '@/bots';
import type { BotProfile } from '@/core/bots';
import { START_FEN } from '@/core/chess';
import { movesFromEvents, type AssistanceLevel, type Game } from '@/core/games';
import { useSubscribable } from '@/lib/observable';
import { Page } from '@/ui/layout';
import { Button, Card, CardMeta, CardTitle } from '@/ui/primitives';
import { BotAvatar } from '../components/BotAvatar';
import { BotCard } from '../components/BotCard';
import { SetupDialog } from '../components/SetupDialog';
import { lastUsedLevel } from '../logic';
import { startBotGame } from '../startGame';
import { STRINGS_DE } from '../strings.de';

const GROUPS: BotGroupId[] = ['beginner', 'intermediate', 'strong'];

/** Spielen – running games, the bot list grouped by strength and the setup dialog (DESIGN §3.6, P0-07, P0-09). */
export function Component() {
  const services = useServices();
  const { data, botRoster } = services;
  const navigate = useNavigate();
  data.activity.useTracking('play');
  const activeSource = useMemo(() => data.repos.games.observeList({ status: 'active', source: 'bot' }), [data]);
  const active = useSubscribable<Game[]>(activeSource, []);
  const ratingSource = useMemo(() => data.repos.ratings.observe('bot'), [data]);
  const rating = useSubscribable(ratingSource, null);
  const [selected, setSelected] = useState<BotProfile | null>(null);
  const [level, setLevel] = useState<AssistanceLevel>('coach');

  useEffect(() => {
    let cancelled = false;
    data.repos.games
      .list({ source: 'bot', limit: 10 })
      .then((games) => !cancelled && setLevel(lastUsedLevel(games)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data]);

  const recommended = useMemo(() => (botRoster.length ? recommendBot(rating?.rating ?? null, botRoster) : null), [botRoster, rating]);
  const groups = GROUPS.map((g) => ({ id: g, bots: botRoster.filter((b) => botGroup(b) === g) })).filter((g) => g.bots.length > 0);

  const start = async (choice: { bot: BotProfile; assistance: AssistanceLevel; color: 'w' | 'b' | 'random' }) => {
    const game = await startBotGame(services, { ...choice, startFen: START_FEN, origin: { type: 'new' } });
    await navigate(paths.playGame(game.id));
  };

  return (
    <Page title={STRINGS_DE.play} subtitle={STRINGS_DE.hubSubtitle}>
      <div className="flex flex-col gap-8">
        {active.length > 0 && (
          <section aria-labelledby="play-continue" className="flex flex-col gap-3">
            <h2 id="play-continue" className="text-h2 text-text">
              {STRINGS_DE.continueTitle}
            </h2>
            {active.map((g) => (
              <ContinueCard key={g.id} game={g} bot={botRoster.find((b) => b.id === g.botId) ?? null} />
            ))}
          </section>
        )}
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`play-group-${group.id}`} className="flex flex-col gap-3">
            <h2 id={`play-group-${group.id}`} className="text-h2 text-text">
              {STRINGS_DE.groups[group.id]}
            </h2>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.bots.map((bot) => (
                <li key={bot.id}>
                  <BotCard bot={bot} recommended={bot.id === recommended?.id} onSelect={setSelected} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="flex flex-wrap items-center gap-3">
          <p className="text-body text-muted">{STRINGS_DE.fromPositionHint}</p>
          <Button variant="secondary" asChild>
            <Link to={paths.playFromPosition('')}>
              <Crosshair aria-hidden="true" />
              {STRINGS_DE.fromPositionLink}
            </Link>
          </Button>
        </section>
      </div>
      <SetupDialog bot={selected} initialLevel={level} onClose={() => setSelected(null)} onStart={start} />
    </Page>
  );
}

function ContinueCard({ game, bot }: { game: Game; bot: BotProfile | null }) {
  const moves = useMovesCount(game.id);
  if (!bot) return null;
  return (
    <Card hero className="flex flex-wrap items-center gap-4">
      <BotAvatar bot={bot} size="lg" />
      <div className="min-w-0 flex-1">
        <CardTitle>{STRINGS_DE.continueGame(bot.name, bot.elo)}</CardTitle>
        <CardMeta>{STRINGS_DE.continueMeta(STRINGS_DE.levels[game.assistance ?? 'coach'], moves)}</CardMeta>
      </div>
      <Button size="lg" asChild>
        <Link to={paths.playGame(game.id)} aria-label={`${STRINGS_DE.continueAction}: ${STRINGS_DE.continueGame(bot.name, bot.elo)}`}>
          <Play aria-hidden="true" />
          {STRINGS_DE.continueAction}
        </Link>
      </Button>
    </Card>
  );
}

/** Number of plies of a game (live). */
function useMovesCount(gameId: string): number {
  const { data } = useServices();
  const source = useMemo(() => data.repos.gameMoves.observe(gameId), [data, gameId]);
  const events = useSubscribable(source, []);
  return movesFromEvents(events).length;
}

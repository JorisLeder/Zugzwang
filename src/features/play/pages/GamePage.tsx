import { Swords } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { Page } from '@/ui/layout';
import { Button, EmptyState, ErrorState, Spinner } from '@/ui/primitives';
import { GameScreen } from '../components/GameScreen';
import { STRINGS_DE } from '../strings.de';
import { useGameController } from '../useGameController';

/** Partie – a running or finished bot game (`/play/game/:gameId`, P0-07…P0-09). */
export function Component() {
  const { gameId = '' } = useParams();
  const { data } = useServices();
  data.activity.useTracking('play');
  const { controller, view } = useGameController(gameId);

  if (!controller || !view || view.phase === 'loading') {
    return (
      <Page title={STRINGS_DE.playGame}>
        <div className="flex items-center gap-3 text-muted" role="status">
          <Spinner />
          {STRINGS_DE.loading}
        </div>
      </Page>
    );
  }
  if (view.phase === 'missing') {
    return (
      <Page title={STRINGS_DE.missingTitle}>
        <EmptyState
          icon={<Swords />}
          title={STRINGS_DE.missingTitle}
          text={STRINGS_DE.missingText}
          action={
            <Button asChild>
              <Link to={paths.play()}>{STRINGS_DE.backToList}</Link>
            </Button>
          }
        />
      </Page>
    );
  }
  if (view.phase === 'error' || !view.bot || !view.game) {
    return (
      <Page title={STRINGS_DE.playGame}>
        <ErrorState message={view.error ?? STRINGS_DE.loadError} />
        <Button variant="link" asChild className="mt-4">
          <Link to={paths.play()}>{STRINGS_DE.backToList}</Link>
        </Button>
      </Page>
    );
  }
  return <GameScreen key={view.game.id} controller={controller} view={view} />;
}

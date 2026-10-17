import { SearchX } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { Page } from '@/ui/layout';
import { Button, EmptyState, ErrorState, Spinner } from '@/ui/primitives';
import { ReviewScreen } from '../components/ReviewScreen';
import { STRINGS_DE } from '../strings.de';
import { useReviewController } from '../useReviewController';

/** Navigation state passed by the PGN import when the game existed already. */
export interface ReviewLocationState {
  duplicate?: boolean;
}

/** Partieanalyse – deep link `/analysis/:gameId` (P0-10, P0-11, P2-02): loads the game and analyses it if needed. */
export function Component() {
  const { gameId = '' } = useParams();
  const location = useLocation();
  const { data } = useServices();
  data.activity.useTracking('analysis');
  const { controller, state } = useReviewController(gameId);
  const duplicate = (location.state as ReviewLocationState | null)?.duplicate === true;

  if (state.status === 'loading') {
    return (
      <Page title={STRINGS_DE.analysisGame}>
        <div className="flex items-center gap-3 text-muted" role="status">
          <Spinner />
          {STRINGS_DE.waitingForGame}
        </div>
      </Page>
    );
  }
  if (state.status === 'missing') {
    return (
      <Page title={STRINGS_DE.notFoundTitle}>
        <EmptyState
          icon={<SearchX />}
          title={STRINGS_DE.notFoundTitle}
          text={STRINGS_DE.notFoundText}
          action={
            <Button asChild>
              <Link to={paths.analysis()}>{STRINGS_DE.backToHub}</Link>
            </Button>
          }
        />
      </Page>
    );
  }
  if (state.status === 'error' || !state.game) {
    return (
      <Page title={STRINGS_DE.analysisGame}>
        <ErrorState message={state.errorDe ?? STRINGS_DE.loadError} onRetry={() => controller.start()} />
        <Button variant="link" asChild className="mt-4">
          <Link to={paths.analysis()}>{STRINGS_DE.backToHub}</Link>
        </Button>
      </Page>
    );
  }
  return <ReviewScreen key={state.game.id} controller={controller} state={state} duplicate={duplicate} />;
}

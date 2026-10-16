import { useRouteError } from 'react-router';
import { Page } from '@/ui/layout/Page';
import { ErrorState } from '@/ui/primitives';
import { APP_DE } from '../strings.de';

/** Error element of the root route: never a blank screen (DESIGN §5.12). */
export function RouteErrorPage() {
  const error = useRouteError();
  console.error(error);
  return (
    <Page title={APP_DE.errorTitle}>
      <ErrorState message={APP_DE.errorText} retryLabel={APP_DE.errorAction} onRetry={() => window.location.reload()} />
    </Page>
  );
}

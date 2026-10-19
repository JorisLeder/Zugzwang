import { useRouteError } from 'react-router';
import { Page } from '@/ui/layout/Page';
import { ErrorState } from '@/ui/primitives/States';
import { APP_DE } from '../strings.de';

/** Error element of the root route: never a blank screen (DESIGN §5.12). */
export function RouteErrorPage() {
  const error = useRouteError();
  console.error(error);
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return (
    <Page title={APP_DE.errorTitle}>
      <ErrorState message={APP_DE.errorText} retryLabel={APP_DE.errorAction} onRetry={() => window.location.reload()} />
      {import.meta.env.DEV && (
        <details className="mt-4 text-sm text-[var(--zz-text-muted)]">
          <summary>{APP_DE.errorDetails}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{detail}</pre>
        </details>
      )}
    </Page>
  );
}

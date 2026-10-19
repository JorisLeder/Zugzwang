import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { EmptyState } from '@/ui/primitives/States';
import { paths } from '../paths';
import { APP_DE } from '../strings.de';

/** 404 page (`*`). */
export function NotFoundPage() {
  return (
    <Page title={APP_DE.notFoundTitle}>
      <EmptyState
        icon={<SearchX />}
        title={APP_DE.notFoundTitle}
        text={APP_DE.notFoundText}
        action={
          <Button asChild>
            <Link to={paths.home()}>{APP_DE.notFoundAction}</Link>
          </Button>
        }
      />
    </Page>
  );
}

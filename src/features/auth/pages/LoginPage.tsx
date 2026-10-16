import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { Page } from '@/ui/layout/Page';
import { Banner, Button } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';

/** Login – PLACEHOLDER (WP-00); owned by WP-08 (e-mail link, Google, cloud mode). */
export function Component() {
  return (
    <main id="main" className="min-h-dvh">
      <Page title={STRINGS_DE.loginTitle}>
        <div className="flex max-w-xl flex-col gap-4">
          <Banner tone="info">{STRINGS_DE.localMode}</Banner>
          <div>
            <Button asChild>
              <Link to={paths.home()}>{STRINGS_DE.toStart}</Link>
            </Button>
          </div>
        </div>
      </Page>
    </main>
  );
}

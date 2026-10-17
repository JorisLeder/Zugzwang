import { Puzzle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Page } from '@/ui/layout';
import { EmptyState, ErrorState, Spinner } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';

/** Loading state of a puzzle page (bank import, selection). */
export function PuzzleLoading({ title }: { title: string }) {
  return (
    <Page title={title}>
      <div className="flex items-center gap-3 text-body text-muted" role="status">
        <Spinner />
        <span>{STRINGS_DE.bankLoading}</span>
      </div>
    </Page>
  );
}

/** Error state with retry (DESIGN §5.12 – never a blank screen). */
export function PuzzleError({ title, message = STRINGS_DE.bankError, onRetry }: { title: string; message?: string; onRetry?: () => void }) {
  return (
    <Page title={title}>
      <ErrorState message={message} onRetry={onRetry} />
    </Page>
  );
}

/** Empty state of a puzzle page (exhausted bank, empty filter). */
export function PuzzleEmpty({ title, heading, text, action }: { title: string; heading: string; text: string; action?: ReactNode }) {
  return (
    <Page title={title}>
      <EmptyState icon={<Puzzle />} title={heading} text={text} action={action} />
    </Page>
  );
}

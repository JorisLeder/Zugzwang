import { Spinner } from '@/ui/primitives/Spinner';
import { APP_DE } from '../strings.de';

/** Fallback while a lazy route loads. */
export function PageSpinner() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center text-muted">
      <Spinner size={28} label={APP_DE.loading} />
    </div>
  );
}

import { useServices } from '@/app/services';
import type { ContentError } from '@/lessons';
import { STRINGS_DE } from '../strings.de';
import { showContentErrors } from '../useLessonData';

const MAX_SHOWN = 8;

/** Visible list of content problems for authors – development and e2e builds only, never in production (D-26). */
export function ContentErrors({ errors }: { errors: readonly ContentError[] }) {
  const { config } = useServices();
  if (errors.length === 0 || !showContentErrors(config.e2e)) return null;
  const shown = errors.slice(0, MAX_SHOWN);
  return (
    <section
      role="alert"
      aria-label={STRINGS_DE.contentErrorsTitle}
      data-testid="lesson-content-errors"
      className="mb-6 rounded-lg border border-danger bg-danger-subtle p-4 text-body-sm text-text"
    >
      <h2 className="mb-2 font-semibold">{STRINGS_DE.contentErrorsTitle}</h2>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {shown.map((e, i) => (
          <li key={`${e.file}-${i}`} className="break-words">
            <code className="font-mono text-caption">{e.file}</code>: {e.messageDe}
          </li>
        ))}
      </ul>
      {errors.length > MAX_SHOWN && <p className="mt-2 text-muted">{STRINGS_DE.contentErrorsMore(errors.length - MAX_SHOWN)}</p>}
    </section>
  );
}

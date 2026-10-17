/**
 * Puzzles hub `/puzzles` (DESIGN §3.6): three large mode cards – Bewertet (with the current rating), Lernmodus,
 * Themen-Training. Each card is one link (single tab stop).
 */
import { BookOpen, Shapes, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { formatNumber } from '@/i18n';
import { Page } from '@/ui/layout';
import { Card, CardMeta, CardTitle } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';
import { usePuzzleRating } from '../usePuzzleData';

function ModeCard({ to, icon, title, text, meta, hero = false }: { to: string; icon: ReactNode; title: string; text: string; meta?: string; hero?: boolean }) {
  return (
    <Card interactive hero={hero} asChild className="h-full">
      <Link to={to} className="flex items-start gap-4">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent-text [&_svg]:size-6">
          {icon}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <span className="text-body text-text">{text}</span>
          {meta && <CardMeta>{meta}</CardMeta>}
        </span>
      </Link>
    </Card>
  );
}

/** Puzzles hub (lazy route module). */
export function Component() {
  const rating = usePuzzleRating();
  const ratedMeta = rating ? STRINGS_DE.hubRatedMeta(formatNumber(Math.round(rating.rating))) : rating === null ? STRINGS_DE.hubRatedMetaNew : undefined;
  return (
    <Page title={STRINGS_DE.puzzles} subtitle={STRINGS_DE.hubSubtitle}>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <li>
          <ModeCard to={paths.puzzlesRated()} icon={<Trophy />} title={STRINGS_DE.puzzlesRated} text={STRINGS_DE.hubRatedText} meta={ratedMeta} hero />
        </li>
        <li>
          <ModeCard to={paths.puzzlesLearn()} icon={<BookOpen />} title={STRINGS_DE.puzzlesLearn} text={STRINGS_DE.hubLearnText} />
        </li>
        <li>
          <ModeCard to={paths.puzzleThemes()} icon={<Shapes />} title={STRINGS_DE.puzzleThemes} text={STRINGS_DE.hubThemesText} />
        </li>
      </ul>
    </Page>
  );
}

/**
 * Analysebrett page `/analysis/board?fen=&pgn=` (PRD §6): free play from the start position, a FEN or a PGN.
 * Invalid parameters show a German error with a way back to an empty board.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { paths } from '@/app/paths';
import { Page, usePageTitle } from '@/ui/layout';
import { Button, ErrorState } from '@/ui/primitives';
import { AnalysisBoard } from '../AnalysisBoard';
import { loadFromParams } from '../analysisLine';
import { STRINGS_DE } from '../strings.de';

/** Analysebrett page (lazy route module). */
export function Component() {
  const [params] = useSearchParams();
  const fenParam = params.get('fen');
  const pgnParam = params.get('pgn');
  const initial = useMemo(() => loadFromParams(fenParam, pgnParam), [fenParam, pgnParam]);
  usePageTitle(STRINGS_DE.title);
  if (!initial.ok) {
    return (
      <Page title={STRINGS_DE.title}>
        <div className="flex flex-col items-start gap-4">
          <ErrorState message={`${STRINGS_DE.invalidPosition} ${initial.errorDe}`} />
          <Button asChild variant="secondary">
            <Link to={paths.analysisBoard()}>{STRINGS_DE.openEmptyBoard}</Link>
          </Button>
        </div>
      </Page>
    );
  }
  return <AnalysisBoard key={`${initial.startFen}|${initial.moves.join(' ')}`} startFen={initial.startFen} initialMoves={initial.moves} />;
}

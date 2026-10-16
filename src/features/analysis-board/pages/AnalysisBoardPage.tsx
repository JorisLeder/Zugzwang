/**
 * Analysebrett – minimal WP-00 version (free play from the start, `?fen=` or `?pgn=`) used by the e2e smoke test of
 * the board selector contract. Owned by WP-01 from wave 1 (editor, engine lines, import/export).
 */
import { ArrowDownUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { paths } from '@/app/paths';
import { START_FEN, type Uci } from '@/core/chess';
import { ChessGame, ChessRulesError } from '@/lib/chess';
import { Board } from '@/ui/board';
import { MoveList, NavigationControls } from '@/ui/chess';
import { BoardLayout } from '@/ui/layout/BoardLayout';
import { PlaceholderPage } from '@/ui/layout/PlaceholderPage';
import { ErrorState, IconButton } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';

function loadStart(fen: string | null, pgn: string | null): { startFen: string; moves: Uci[] } | { error: string } {
  try {
    if (pgn) {
      const g = ChessGame.fromPgn(pgn);
      return { startFen: g.startFen(), moves: g.uciMoves() };
    }
    return { startFen: ChessGame.fromFen(fen ?? START_FEN).startFen(), moves: [] };
  } catch (e) {
    return { error: e instanceof ChessRulesError ? e.messageDe : STRINGS_DE.invalidPosition };
  }
}

/** Analysebrett page. */
export function Component() {
  const [params] = useSearchParams();
  const initial = useMemo(() => loadStart(params.get('fen'), params.get('pgn')), [params]);
  if ('error' in initial) {
    return (
      <PlaceholderPage title={STRINGS_DE.title}>
        <ErrorState message={`${STRINGS_DE.invalidPosition} ${initial.error}`} />
      </PlaceholderPage>
    );
  }
  return <AnalysisBoard key={`${initial.startFen}|${initial.moves.join(' ')}`} startFen={initial.startFen} initialMoves={initial.moves} />;
}

function AnalysisBoard({ startFen, initialMoves }: { startFen: string; initialMoves: Uci[] }) {
  const [moves, setMoves] = useState<Uci[]>(initialMoves);
  const [ply, setPly] = useState(initialMoves.length);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const game = useMemo(() => ChessGame.fromMoves(startFen, moves), [startFen, moves]);
  const history = game.history();
  const shown = useMemo(() => ChessGame.fromMoves(startFen, moves.slice(0, ply)), [startFen, moves, ply]);
  const last = history[ply - 1];

  return (
    <BoardLayout
      title={STRINGS_DE.title}
      backTo={paths.analysis()}
      board={
        <Board
          fen={shown.fen()}
          orientation={orientation}
          lastMove={last ? { from: last.from, to: last.to } : null}
          onMove={(m) => {
            // Playing from an earlier ply replaces the later moves (WP-01 adds a confirmation).
            setMoves([...moves.slice(0, ply), m.uci]);
            setPly(ply + 1);
          }}
        />
      }
      panelTabs={
        history.length ? (
          <MoveList moves={history} currentPly={ply} onSelectPly={setPly} />
        ) : (
          <p className="text-body text-muted">{STRINGS_DE.noMoves}</p>
        )
      }
      actions={
        <>
          <NavigationControls ply={ply} maxPly={history.length} onNavigate={setPly} />
          <IconButton
            label={STRINGS_DE.flip}
            icon={<ArrowDownUp />}
            className="ml-auto"
            onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
          />
        </>
      }
    />
  );
}

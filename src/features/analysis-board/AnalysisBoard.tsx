import { PencilRuler, Swords } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices, useSettings } from '@/app/services';
import type { Arrow, Fen, GameStatus, MoveRecord, Uci } from '@/core/chess';
import { formatEval } from '@/i18n';
import { ChessGame, fenTurn, parseUci, toUci } from '@/lib/chess';
import { Board, BoardMenu, FlipBoardButton, type Orientation } from '@/ui/board';
import { EvalBar, MoveList, NavigationControls, usePlyNavigation } from '@/ui/chess';
import { BoardLayout } from '@/ui/layout';
import { Button, IconButton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives';
import { playSound, soundForMove } from '@/ui/sound';
import { lineGame, movesToReplace, newLine, playAt, shownGame, type AnalysisLine } from './analysisLine';
import { EnginePanel } from './EnginePanel';
import { ImportExport } from './ImportExport';
import { PositionEditor } from './PositionEditor';
import { readPref, writePref } from './prefs';
import { ReplaceMovesDialog } from './ReplaceMovesDialog';
import { STRINGS_DE } from './strings.de';
import { useLiveEngine } from './useLiveEngine';

/** Props of `AnalysisBoard`. */
export interface AnalysisBoardProps {
  startFen: Fen;
  initialMoves: Uci[];
}

type PanelTab = 'engine' | 'moves';

function statusText(status: GameStatus): string {
  if (status.isOver && status.reason) {
    const winner = status.result === '1-0' ? 'w' : status.result === '0-1' ? 'b' : null;
    return STRINGS_DE.gameOver(status.reason, winner);
  }
  const turn = status.turn === 'w' ? STRINGS_DE.whiteToMove : STRINGS_DE.blackToMove;
  return status.inCheck ? `${turn} – Schach` : turn;
}

/**
 * Analysebrett (PRD §6, §3 "Variante erkunden"): free play from any position with move list and navigation,
 * live engine (top 2 lines, eval bar, best-move arrow), position editor, FEN/PGN import/export and
 * "Gegen Bot ausspielen". Playing a move at an earlier ply replaces the later moves after a confirmation.
 */
export function AnalysisBoard({ startFen, initialMoves }: AnalysisBoardProps) {
  const services = useServices();
  const notation = useSettings((s) => s.notation);
  const navigate = useNavigate();
  const [line, setLine] = useState<AnalysisLine>(() => newLine(startFen, initialMoves));
  const [orientation, setOrientation] = useState<Orientation>(() => (fenTurn(startFen) === 'b' ? 'black' : 'white'));
  const [mode, setMode] = useState<'analyse' | 'edit'>('analyse');
  const [tab, setTab] = useState<PanelTab>(() => (readPref('tab') === 'moves' ? 'moves' : 'engine'));
  const [engineOn, setEngineOn] = useState(() => readPref('engine') === 'on');
  const [confirm, setConfirm] = useState<{ count: number; resolve: (ok: boolean) => void } | null>(null);

  // The full line is replayed only when the moves change, not on navigation.
  const { startFen: lineStart, moves: lineMoves } = line;
  const history = useMemo(() => lineGame({ startFen: lineStart, moves: lineMoves, ply: 0 }).history(), [lineStart, lineMoves]);
  const shown = useMemo(() => shownGame(line), [line]);
  const fen = shown.fen();
  const status = shown.status();
  const last = history[line.ply - 1];

  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), []);
  const setPly = useCallback((ply: number) => setLine((l) => ({ ...l, ply })), []);
  const nav = usePlyNavigation({ maxPly: line.moves.length, ply: line.ply, onPlyChange: setPly, keyboard: mode === 'analyse' && confirm === null });
  const engine = useLiveEngine(services.engines.analysis, fen, engineOn && mode === 'analyse');

  /** Asks before a move deletes later moves (resolves false on cancel). */
  const confirmMove = (uci: Uci): boolean | Promise<boolean> => {
    const count = movesToReplace(line, uci);
    if (count === 0) return true;
    return new Promise<boolean>((resolve) => setConfirm({ count, resolve }));
  };

  const answer = (ok: boolean) => {
    confirm?.resolve(ok);
    setConfirm(null);
  };

  const onBoardMove = (m: MoveRecord) => setLine((l) => playAt(l, m.uci));

  const playEngineMove = async (uci: Uci) => {
    const record = ChessGame.fromFen(fen).move(uci);
    if (!record || !(await confirmMove(uci))) return;
    playSound(soundForMove(record));
    // Only if the position did not change while the dialog was open.
    setLine((l) => (shownGame(l).fen() === fen ? playAt(l, uci) : l));
  };

  const toggleEngine = (on: boolean) => {
    setEngineOn(on);
    writePref('engine', on ? 'on' : 'off');
  };

  const best = engineOn ? engine.lines[0] : undefined;
  const bestMove = best?.pv[0] ? parseUci(best.pv[0]) : null;
  const arrows: Arrow[] = bestMove ? [{ from: bestMove.from, to: bestMove.to, kind: 'best' }] : [];
  const score = best?.score ?? null;
  const menu = <BoardMenu onFlip={flip} />;

  if (mode === 'edit') {
    return (
      <PositionEditor
        initialFen={fen}
        orientation={orientation}
        onFlip={flip}
        backTo={paths.analysis()}
        menu={menu}
        onCancel={() => setMode('analyse')}
        onApply={(edited) => {
          setLine(newLine(ChessGame.fromFen(edited).startFen()));
          setMode('analyse');
        }}
      />
    );
  }

  return (
    <>
      <BoardLayout
        title={STRINGS_DE.title}
        backTo={paths.analysis()}
        menu={menu}
        panelHeader={
          <div className="flex items-center gap-2">
            <p aria-hidden="true" className="min-w-0 flex-1 text-h3 text-text">
              {STRINGS_DE.title}
            </p>
            {menu}
          </div>
        }
        evalBar={engineOn ? <EvalBar score={score} orientation={orientation} direction="vertical" /> : undefined}
        evalBarHorizontal={engineOn ? <EvalBar score={score} orientation={orientation} direction="horizontal" /> : undefined}
        board={
          <Board
            fen={fen}
            orientation={orientation}
            lastMove={last ? { from: last.from, to: last.to } : null}
            arrows={arrows}
            onMove={onBoardMove}
            onMoveAttempt={(input) => confirmMove(toUci(input))}
            onFlip={flip}
          />
        }
        panelTabs={
          <div className="flex flex-col gap-3">
            <p data-testid="position-status" className="text-body-sm text-muted">
              {statusText(status)}
              {score && <span className="md:hidden"> · {STRINGS_DE.evalLabel(formatEval(score))}</span>}
            </p>
            <Tabs
              value={tab}
              onValueChange={(v) => {
                setTab(v as PanelTab);
                writePref('tab', v);
              }}
              className="flex flex-col"
            >
              <TabsList aria-label={STRINGS_DE.panelTabs}>
                <TabsTrigger value="engine">{STRINGS_DE.tabEngine}</TabsTrigger>
                <TabsTrigger value="moves">{STRINGS_DE.tabMoves}</TabsTrigger>
              </TabsList>
              <TabsContent value="engine" className="flex flex-col gap-6 pt-4">
                <EnginePanel
                  enabled={engineOn}
                  onToggle={toggleEngine}
                  engine={engine}
                  fen={fen}
                  gameOver={status.isOver}
                  notation={notation}
                  onPlayMove={(uci) => void playEngineMove(uci)}
                />
                <div>
                  <Button icon={<Swords />} onClick={() => void navigate(paths.playFromPosition(fen))}>
                    {STRINGS_DE.playVsBot}
                  </Button>
                </div>
                <ImportExport line={line} onLoad={(r) => setLine(newLine(r.startFen, r.moves))} />
              </TabsContent>
              <TabsContent value="moves" className="pt-4">
                {history.length ? (
                  <MoveList moves={history} currentPly={line.ply} onSelectPly={nav.setPly} />
                ) : (
                  <p className="text-body text-muted">{STRINGS_DE.noMoves}</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        }
        actions={
          <>
            <NavigationControls ply={line.ply} maxPly={line.moves.length} onNavigate={nav.setPly} />
            <FlipBoardButton onFlip={flip} className="ml-auto" />
            <IconButton label={STRINGS_DE.setup} icon={<PencilRuler />} onClick={() => setMode('edit')} />
          </>
        }
      />
      <ReplaceMovesDialog count={confirm?.count ?? null} onAnswer={answer} />
    </>
  );
}

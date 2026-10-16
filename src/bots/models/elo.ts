/**
 * Strong bots 2100–2500 (D-16, PRD "Stockfish mit `UCI_LimitStrength` und `UCI_Elo`"): Stockfish's own strength
 * limiter. Options are restored by the engine service after the call.
 */
import type { Fen, Uci } from '@/core/chess';
import type { EngineService } from '@/core/engine';
import { ChessGame } from '@/lib/chess';
import type { EloParams } from '../params';

/** Chooses the move of a strong bot; falls back to the first legal move if the engine reports none. */
export async function chooseEloMove(engine: EngineService, fen: Fen, params: EloParams, signal?: AbortSignal): Promise<Uci | null> {
  const r = await engine.bestMove(fen, {
    limitStrengthElo: params.uciElo,
    movetimeMs: params.movetimeMs,
    depth: params.depth,
    ...(signal ? { signal } : {}),
  });
  const legal = ChessGame.fromFen(fen).legalMoves();
  if (r.move && legal.some((m) => m.uci === r.move)) return r.move;
  return legal[0]?.uci ?? null;
}

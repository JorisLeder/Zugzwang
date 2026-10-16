/**
 * `FakeBotEngine` – plays a random legal move (seeded, reproducible). Opening repertoire is ignored.
 */
import { ChessGame } from '@/lib/chess';
import type { BotEngine, BotMove, BotMoveRequest, BotProfile } from '../bots';
import type { Fen } from '../chess';

/** Small deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Options of `FakeBotEngine`. */
export interface FakeBotOptions {
  seed?: number;
  /** Answer of `shouldClaimDraw` (default false). */
  claimDraws?: boolean;
  /** `thinkTimeMs` reported with each move (default 0). */
  thinkTimeMs?: number;
}

/** Random-move bot (seeded). */
export class FakeBotEngine implements BotEngine {
  private readonly random: () => number;
  private readonly claimDraws: boolean;
  private readonly thinkTimeMs: number;
  /** Requests received. */
  readonly requests: BotMoveRequest[] = [];

  constructor(opts: FakeBotOptions = {}) {
    this.random = seededRandom(opts.seed ?? 42);
    this.claimDraws = opts.claimDraws ?? false;
    this.thinkTimeMs = opts.thinkTimeMs ?? 0;
  }

  async chooseMove(req: BotMoveRequest): Promise<BotMove> {
    this.requests.push(req);
    if (req.signal?.aborted) throw new DOMException('Bot move aborted', 'AbortError');
    const t0 = Date.now();
    const moves = ChessGame.fromMoves(req.startFen, req.moves).legalMoves();
    const pick = moves[Math.floor(this.random() * moves.length)];
    if (!pick) throw new Error('No legal move for the bot');
    return { uci: pick.uci, source: 'engine', thinkTimeMs: this.thinkTimeMs, computeMs: Date.now() - t0 };
  }

  async shouldClaimDraw(_fen: Fen, _bot: BotProfile): Promise<boolean> {
    return this.claimDraws;
  }
}

/**
 * `MaiaBotEngine` – STUB of a Maia-2 adapter. The Maia models live on Hugging Face, which this build could not reach,
 * so bots marked `engine: 'maia'` currently play with the human error model of `StockfishBotEngine` (fallback).
 *
 * Plugging Maia in later:
 * 1. Convert Maia-2 (rapid/blitz) to ONNX (opset >= 17), serve it as `public/models/maia2-<variant>.onnx`; check the
 *    licence of code and weights and add it to THIRD_PARTY_NOTICES.md.
 * 2. Add `onnxruntime-web` (WASM, single thread), load it lazily in `load()`, run it in a Web Worker.
 * 3. Input: board planes (pieces per colour/type, side to move, castling, e.p.), mirrored for Black, plus Elo buckets –
 *    take the exact encoding from the Maia-2 reference code; build planes from `@/lib/chess` (`boardPieces`, `parseFen`).
 * 4. Output: policy logits over Maia-2's move vocabulary; mask illegal moves (`ChessGame.fromFen(fen).legalMoves()`),
 *    softmax, sample (temperature ~1).
 * 5. Wire it in `createBotEngine`, set the 800–2000 bots in `roster.ts` to `'maia'`, re-run `npm run bots:calibrate`.
 */
import type { BotEngine, BotMove, BotMoveRequest, BotProfile } from '@/core/bots';
import type { Fen } from '@/core/chess';

/** Where a Maia model would come from (ONNX file served by the app). */
export interface MaiaModelSource {
  /** URL of the ONNX model (e.g. `/models/maia2-rapid.onnx`). */
  url: string;
}

/** Maia adapter stub: `isAvailable()` is false and every move comes from `fallback`. */
export class MaiaBotEngine implements BotEngine {
  private loaded = false;

  constructor(private readonly fallback: BotEngine) {}

  /** Whether a Maia model is loaded (always false in V1). */
  isAvailable(): boolean {
    return this.loaded;
  }

  /**
   * Loads a model. V1 has no model and no onnxruntime-web dependency, so this always rejects; callers keep using the
   * fallback. A real implementation creates an `InferenceSession` here (see README).
   */
  async load(source: MaiaModelSource): Promise<void> {
    throw new Error(`Maia ist in V1 nicht verfügbar (Modell ${source.url} nicht geladen).`);
  }

  async chooseMove(req: BotMoveRequest): Promise<BotMove> {
    // Without a model the human error model plays (D-16: `engine: 'maia'` falls back to `stockfish-human`).
    return this.fallback.chooseMove({ ...req, bot: { ...req.bot, engine: 'stockfish-human' } });
  }

  shouldClaimDraw(fen: Fen, bot: BotProfile): Promise<boolean> {
    return this.fallback.shouldClaimDraw(fen, bot);
  }
}

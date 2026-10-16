/**
 * `MaiaBotEngine` – STUB of a Maia-2 adapter (D-16, CONSTRAINTS §2: the Maia models live on Hugging Face, which is
 * not reachable from this build). It documents the interface a real adapter fills in (see `README.md`) and, until a
 * model is loaded, delegates every call to the fallback engine (the human error model of `StockfishBotEngine`).
 */
import type { BotEngine, BotMove, BotMoveRequest, BotProfile } from '@/core/bots';
import type { Fen } from '@/core/chess';

/** Where a Maia model would come from (ONNX file served by the app, see README). */
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

# Maia adapter (plan) – `MaiaBotEngine`

**Status in V1: stub.** The PRD wants a network trained on human games (Maia-2) for the bots between 800 and 2000
Elo. The Maia weights are published on Hugging Face, which this build cannot reach (CONSTRAINTS §2). V1 therefore
plays these bots with the human error model of `StockfishBotEngine` (D-16): MultiPV candidates, softmax over the
expected-points loss, Elo-dependent depth and "blindness" to opponent replies, natural-move bonuses. A bot with
`engine: 'maia'` uses exactly that model until a real adapter exists.

## How to plug Maia in later

1. **Model:** convert Maia-2 (rapid or blitz) to ONNX (`torch.onnx.export`, opset ≥ 17) and serve it from
   `public/models/maia2-<variant>.onnx`. Check the licence of the code and the weights before shipping (the original Maia repository is GPL-3.0; verify
   Maia-2's own terms) and add it to `THIRD_PARTY_NOTICES.md`.
2. **Runtime:** add `onnxruntime-web` (WASM backend, single thread is enough). Load it lazily from
   `MaiaBotEngine.load()` so it never enters the main chunk; keep the session in a Web Worker next to Stockfish.
3. **Input encoding** (from the Maia-2 reference code – verify against the version you convert): the board as 18 × 8 × 8 planes (pieces per colour and type, side to move,
   castling rights, e.p.) mirrored for Black, plus the player's and the opponent's Elo bucket. Build the planes from
   `boardPieces(fen)` / `parseFen(fen)` (`@/lib/chess`) – never from chess.js directly.
4. **Output decoding:** the policy head gives logits over Maia-2's fixed move vocabulary (about 1 900 UCI moves mirrored for Black; take the exact list from the reference code).
   Mask illegal moves with `ChessGame.fromFen(fen).legalMoves()`, apply softmax, sample with a temperature ≈ 1
   (or take the arg-max for "typical" play).
5. **Wiring:** in `createBotEngine` wrap the Stockfish engine: `new MaiaBotEngine(stockfish)`; route bots with
   `engine: 'maia'` to it and set the 800–2000 bots in `roster.ts` to `'maia'`. Keep `shouldClaimDraw` on Stockfish.
6. **Calibration:** re-run `npm run bots:calibrate`; the acceptance targets (EP loss falling with Elo, inaccuracies +
   mistakes ≥ 2 × blunders, best-move share 25–75 %) stay the same.
7. **Budget:** one Maia forward pass is a few milliseconds; the bot answer must stay ≤ 1 s compute (NFR).

Interface to implement (already declared in `MaiaBotEngine.ts`): `isAvailable()`, `load(source)`, `chooseMove(req)`
(returns `source: 'human-model'`), `shouldClaimDraw(fen, bot)`.

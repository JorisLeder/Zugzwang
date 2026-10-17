/**
 * Pure part of the bot calibration (`npm run bots:calibrate`, BACKLOG WP-04 acceptance criteria 2 and 3):
 * loss classes (D-07 thresholds), per-bot statistics, the acceptance checks and the Markdown report.
 */
import type { BotProfile } from '@/core/bots';
import type { Color, Fen, Uci } from '@/core/chess';
import type { Score } from '@/core/engine';
import { scoreWinPercent } from '@/analysis';
import { ChessGame } from '@/lib/chess';

/** D-07 boundaries on the expected-points loss L (0–1). */
export const LOSS_THRESHOLDS = { best: 0.005, excellent: 0.02, good: 0.05, inaccuracy: 0.1, blunder: 0.2 } as const;

/** Acceptance targets (BACKLOG WP-04 criteria 2/3). */
export const TARGETS = {
  /** Human-model bots: best-move share in [min, max]. */
  bestShare: { min: 0.25, max: 0.75 },
  /** Human-model bots: (inaccuracies + mistakes) ≥ ratio × blunders. */
  errorRatio: 2,
  /** Elo band of the human-model check. */
  humanBand: { min: 800, max: 2000 },
  /** Compute time per move (ms). */
  maxComputeMs: 1000,
  /** Think time range (ms). */
  thinkMs: { min: 1000, max: 8000 },
} as const;

/** Evenly spaced subset of `n` items (deterministic; all items when `n` is missing or too large). */
export function spread<T>(items: T[], n: number | undefined): T[] {
  if (!n || n >= items.length) return items;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.floor((i * items.length) / n)]!);
  return out;
}

/** Loss class of one move. */
export type LossClass = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** Class of a move with loss `loss`; `isBest` = the reference engine's best move. */
export function lossClass(loss: number, isBest: boolean): LossClass {
  const t = LOSS_THRESHOLDS;
  if (isBest || loss < t.best) return 'best';
  if (loss <= t.excellent) return 'excellent';
  if (loss <= t.good) return 'good';
  if (loss <= t.inaccuracy) return 'inaccuracy';
  if (loss < t.blunder) return 'mistake';
  return 'blunder';
}

/** Reference evaluation of a position: best move and score (White POV, D-08). */
export interface ReferenceEval {
  bestMove: Uci | null;
  score: Score;
}

/**
 * Expected-points loss of `uci` in `fen` from reference evaluations of the position before and after the move
 * (mover's point of view, D-07/D-08). Finished positions after the move are scored by the rules (mate / draw).
 */
export function moveLoss(fen: Fen, uci: Uci, before: ReferenceEval, after: ReferenceEval | null): { loss: number; isBest: boolean } {
  const game = ChessGame.fromFen(fen);
  const mover: Color = game.turn();
  const rec = game.move(uci);
  if (!rec) throw new Error(`Illegal move ${uci} in ${fen}`);
  const isBest = before.bestMove === uci;
  if (isBest) return { loss: 0, isBest };
  const turnAfter: Color = mover === 'w' ? 'b' : 'w';
  const status = game.status();
  let afterWin: number;
  if (status.isOver) afterWin = status.reason === 'checkmate' ? scoreWinPercent({ type: 'mate', value: 0 }, mover, turnAfter) : 50;
  else if (after) afterWin = scoreWinPercent(after.score, mover, turnAfter);
  else throw new Error(`Missing reference evaluation after ${uci} in ${fen}`);
  const bestWin = scoreWinPercent(before.score, mover, mover);
  const loss = Math.max(0, (bestWin - afterWin) / 100);
  return { loss: Math.round(loss * 10_000) / 10_000, isBest };
}

/** One measured bot move. */
export interface MoveSample {
  positionId: string;
  fen: Fen;
  uci: Uci;
  source: 'book' | 'engine' | 'human-model';
  computeMs: number;
  thinkTimeMs: number;
  loss: number;
  isBest: boolean;
}

/** Statistics of one bot. */
export interface BotStats {
  id: string;
  name: string;
  elo: number;
  engine: BotProfile['engine'];
  positions: number;
  meanLoss: number;
  shares: Record<LossClass, number>;
  compute: { mean: number; p95: number; max: number };
  think: { min: number; mean: number; max: number };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Aggregates the samples of one bot. */
export function aggregate(bot: Pick<BotProfile, 'id' | 'name' | 'elo' | 'engine'>, samples: MoveSample[]): BotStats {
  const shares: Record<LossClass, number> = { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const s of samples) shares[lossClass(s.loss, s.isBest)] += 1;
  for (const k of Object.keys(shares) as LossClass[]) shares[k] = samples.length ? shares[k] / samples.length : 0;
  const compute = samples.map((s) => s.computeMs);
  const think = samples.map((s) => s.thinkTimeMs);
  return {
    id: bot.id,
    name: bot.name,
    elo: bot.elo,
    engine: bot.engine,
    positions: samples.length,
    meanLoss: mean(samples.map((s) => s.loss)),
    shares,
    compute: { mean: mean(compute), p95: percentile(compute, 0.95), max: compute.length ? Math.max(...compute) : 0 },
    think: { min: think.length ? Math.min(...think) : 0, mean: mean(think), max: think.length ? Math.max(...think) : 0 },
  };
}

/** Result of one acceptance check. */
export interface CriterionResult {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

/** Acceptance checks (criteria 2 and 3). `stats` sorted by Elo. */
export function checkCriteria(stats: BotStats[]): CriterionResult[] {
  const sorted = [...stats].sort((a, b) => a.elo - b.elo);
  const results: CriterionResult[] = [];
  const violations = sorted.slice(1).filter((s, i) => !(s.meanLoss < sorted[i]!.meanLoss));
  results.push({
    id: '2a',
    description: 'Mean expected-points loss strictly decreasing with Elo',
    pass: violations.length === 0,
    detail: violations.length === 0 ? 'every bot loses less than the next weaker one' : `not decreasing at ${violations.map((v) => `${v.name} (${v.elo})`).join(', ')}`,
  });
  const human = sorted.filter((s) => s.elo >= TARGETS.humanBand.min && s.elo <= TARGETS.humanBand.max);
  const ratioFails = human.filter((s) => s.shares.inaccuracy + s.shares.mistake < TARGETS.errorRatio * s.shares.blunder);
  results.push({
    id: '2b',
    description: '800–2000 bots: (inaccuracies + mistakes) ≥ 2 × blunders',
    pass: human.length > 0 && ratioFails.length === 0,
    detail: ratioFails.length === 0 ? `${human.length} bots checked` : `fails for ${ratioFails.map((s) => s.name).join(', ')}`,
  });
  const shareFails = human.filter((s) => s.shares.best < TARGETS.bestShare.min || s.shares.best > TARGETS.bestShare.max);
  results.push({
    id: '2c',
    description: '800–2000 bots: best-move share between 25 % and 75 %',
    pass: human.length > 0 && shareFails.length === 0,
    detail: shareFails.length === 0 ? `range ${pct(Math.min(...human.map((s) => s.shares.best)))} – ${pct(Math.max(...human.map((s) => s.shares.best)))}` : `fails for ${shareFails.map((s) => `${s.name} (${pct(s.shares.best)})`).join(', ')}`,
  });
  const slow = sorted.filter((s) => s.compute.max > TARGETS.maxComputeMs);
  results.push({
    id: '3a',
    description: 'Compute time ≤ 1 s per move (maximum over all positions)',
    pass: slow.length === 0,
    detail: slow.length === 0 ? `slowest move ${Math.max(...sorted.map((s) => s.compute.max))} ms` : `too slow: ${slow.map((s) => `${s.name} (${s.compute.max} ms)`).join(', ')}`,
  });
  const thinkFails = sorted.filter((s) => s.think.min < TARGETS.thinkMs.min || s.think.max > TARGETS.thinkMs.max);
  results.push({
    id: '3b',
    description: 'Think time between 1 s and 8 s (outside e2e)',
    pass: thinkFails.length === 0,
    detail: thinkFails.length === 0 ? `range ${Math.min(...sorted.map((s) => s.think.min))}–${Math.max(...sorted.map((s) => s.think.max))} ms` : `out of range: ${thinkFails.map((s) => s.name).join(', ')}`,
  });
  return results;
}

/** Report metadata. */
export interface ReportMeta {
  date: string;
  positions: number;
  games: string[];
  referenceDepth: number;
  engineId: string;
  seed: number;
  durationSec: number;
  parameters: string[];
  notes?: string[];
}

/** Renders `.cache/bot-calibration.md`. */
export function renderReport(stats: BotStats[], criteria: CriterionResult[], meta: ReportMeta): string {
  const rows = [...stats]
    .sort((a, b) => a.elo - b.elo)
    .map(
      (s) =>
        `| ${s.name} | ${s.elo} | ${s.engine} | ${s.positions} | ${s.meanLoss.toFixed(4)} | ${pct(s.shares.best)} | ${pct(s.shares.excellent + s.shares.good)} | ${pct(s.shares.inaccuracy)} | ${pct(s.shares.mistake)} | ${pct(s.shares.blunder)} | ${Math.round(s.compute.mean)} / ${s.compute.p95} / ${s.compute.max} | ${(s.think.min / 1000).toFixed(1)}–${(s.think.max / 1000).toFixed(1)} |`,
    );
  const allPass = criteria.every((c) => c.pass);
  return [
    '# Bot calibration',
    '',
    `Generated by \`npm run bots:calibrate\` (WP-04) on ${meta.date}. Do not edit by hand – re-run the script after changing`,
    '`src/bots/params.ts`, `src/bots/models/*` or the roster.',
    '',
    `**Result: ${allPass ? 'all acceptance checks pass' : 'SOME CHECKS FAIL'}.**`,
    '',
    '## Method',
    '',
    `- Positions: ${meta.positions} positions (every position before a move with more than one legal move) from the`,
    `  fixture games: ${meta.games.join(', ')} (\`scripts/bots/fixtureGames.ts\`).`,
    '- Each bot chooses one move per position with its production model (`createBotEngineWithOptions`, Node Stockfish',
    `  \`${meta.engineId}\`), without the opening repertoire; every bot uses the same random seed ${meta.seed} (common random numbers – the
  differences between bots are less noisy).`,
    `- Reference: Stockfish depth ${meta.referenceDepth} on the position before and after the move. Expected-points loss`,
    '  L = max(0, EP(best) − EP(played)), EP = win% / 100 from the mover\'s point of view (Lichess formula, D-07/D-08);',
    "  the reference engine's own best move counts as L = 0.",
    '- Classes (D-07): best L < 0.005 (or the reference best move) · excellent ≤ 0.02 · good ≤ 0.05 · inaccuracy ≤ 0.10 ·',
    '  mistake < 0.20 · blunder ≥ 0.20.',
    '- Compute time = wall time of `chooseMove` in Node (single-threaded WASM, no artificial think time). Think time is the',
    '  suggested artificial delay (`thinkTimeMs`, 1–8 s by complexity; 0 in e2e runs).',
    `- Run time: ${Math.round(meta.durationSec)} s.`,
    '',
    '## Results',
    '',
    '| Bot | Elo | Engine | Positions | Mean EP loss | Best | Excellent + good | Inaccuracy | Mistake | Blunder | Compute ms (mean / p95 / max) | Think s |',
    '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows,
    '',
    '## Acceptance checks',
    '',
    '| # | Check | Result | Detail |',
    '|---|---|---|---|',
    ...criteria.map((c) => `| ${c.id} | ${c.description} | ${c.pass ? 'pass' : '**FAIL**'} | ${c.detail} |`),
    '',
    '## Model parameters',
    '',
    ...meta.parameters.map((p) => `- ${p}`),
    ...(meta.notes?.length ? ['', '## Notes', '', ...meta.notes.map((n) => `- ${n}`)] : []),
    '',
  ].join('\n');
}

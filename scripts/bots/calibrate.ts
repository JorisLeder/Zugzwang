/**
 * `npm run bots:calibrate` – measures every bot of the roster and writes `docs/team/bot-calibration.md`
 * (BACKLOG WP-04 acceptance criteria 2 and 3).
 *
 * Each bot plays one move in every calibration position (`fixtureGames.ts`, ≥ 200 positions) with its production
 * model (`StockfishBotEngine`, opening repertoire off, seeded random). A reference Stockfish (depth 14) evaluates the
 * position before and after the move; the expected-points loss is classified with the D-07 thresholds.
 *
 * Flags:
 *   --bots a,b        only these bot ids (default: all)
 *   --limit N         use N evenly spaced positions (default: all)
 *   --ref-depth N     reference depth (default 14)
 *   --seed N          random seed (default 20261016)
 *   --json FILE       also write the statistics as JSON (for sharded runs)
 *   --merge F1,F2     do not measure – merge JSON files of sharded runs and write the report
 *   --no-report       do not write docs/team/bot-calibration.md
 * Reference evaluations are cached in `.cache/bots-calibration/` (keyed by FEN and depth).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOT_ROSTER, botModel, eloParams, humanParams, skillParams, StockfishBotEngine, createSeededRandom } from '@/bots';
import type { BotProfile } from '@/core/bots';
import type { Fen } from '@/core/chess';
import { ChessGame } from '@/lib/chess';
import { createNodeEngineService, NODE_ENGINE_ID } from '@/lib/uci/node';
import { aggregate, checkCriteria, moveLoss, renderReport, type BotStats, type MoveSample, type ReferenceEval } from './calibration';
import { calibrationPositions, CLASSICAL_GAMES, type CalibrationPosition } from './fixtureGames';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT = join(ROOT, 'docs', 'team', 'bot-calibration.md');
const CACHE_DIR = join(ROOT, '.cache', 'bots-calibration');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Stable small hash of a string (per-bot seed). */
function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Evenly spaced subset of `n` positions (deterministic). */
export function spread<T>(items: T[], n: number | undefined): T[] {
  if (!n || n >= items.length) return items;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.floor((i * items.length) / n)]!);
  return out;
}

/** Model parameters of a bot, as one report line. */
function describeParams(bot: BotProfile): string {
  const model = botModel(bot);
  if (model === 'skill') {
    const p = skillParams(bot.elo);
    return `${bot.name} (${bot.elo}, skill): Skill Level ${p.skillLevel}, depth ${p.depth}, movetime ${p.movetimeMs} ms, gross-error rate ${p.grossErrorRate}, plausibility temperature ${p.plausibilityTemperature}`;
  }
  if (model === 'elo') {
    const p = eloParams(bot.elo);
    return `${bot.name} (${bot.elo}, elo): UCI_Elo ${p.uciElo}, movetime ${p.movetimeMs} ms, depth ≤ ${p.depth}`;
  }
  const p = humanParams(bot.elo, bot.style);
  return `${bot.name} (${bot.elo}, human): depth ${p.depth}, MultiPV ${p.multiPv}, movetime ${p.movetimeMs} ms, temperature ${p.temperature}, blindness ${p.blindness} (shallow depth ${p.shallowDepth}), natural bonus ${JSON.stringify(p.natural)}`;
}

interface ShardResult {
  stats: BotStats[];
  positions: number;
  refDepth: number;
  seed: number;
  durationSec: number;
}

async function measure(bots: BotProfile[], positions: CalibrationPosition[], refDepth: number, seed: number): Promise<ShardResult> {
  const t0 = Date.now();
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, `ref-d${refDepth}.json`);
  const cache = new Map<string, ReferenceEval>(existsSync(cacheFile) ? Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<string, ReferenceEval>) : []);
  const saveCache = () => {
    const onDisk = existsSync(cacheFile) ? (JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<string, ReferenceEval>) : {};
    writeFileSync(cacheFile, JSON.stringify({ ...onDisk, ...Object.fromEntries(cache) }));
  };
  const ref = createNodeEngineService({ id: 'reference' });
  const play = createNodeEngineService();
  await Promise.all([ref.init(), play.init()]);

  const reference = async (fen: Fen): Promise<ReferenceEval> => {
    const hit = cache.get(fen);
    if (hit) return hit;
    const a = await ref.analyse(fen, { depth: refDepth });
    const r: ReferenceEval = { bestMove: a.bestMove, score: a.lines[0]?.score ?? { type: 'cp', value: 0 } };
    cache.set(fen, r);
    return r;
  };

  const stats: BotStats[] = [];
  try {
    for (const bot of bots) {
      const sb = new StockfishBotEngine(play, { random: createSeededRandom(seed + hash(bot.id)), useRepertoire: false });
      const samples: MoveSample[] = [];
      for (const [i, pos] of positions.entries()) {
        const move = await sb.chooseMove({ bot, startFen: pos.startFen, moves: pos.moves });
        const before = await reference(pos.fen);
        let after: ReferenceEval | null = null;
        if (move.uci !== before.bestMove) {
          const g = ChessGame.fromFen(pos.fen);
          const rec = g.move(move.uci);
          if (rec && !g.status().isOver) after = await reference(rec.fenAfter);
        }
        const { loss, isBest } = moveLoss(pos.fen, move.uci, before, after);
        samples.push({ positionId: pos.id, fen: pos.fen, uci: move.uci, source: move.source, computeMs: move.computeMs, thinkTimeMs: move.thinkTimeMs, loss, isBest });
        if ((i + 1) % 100 === 0) process.stdout.write(`  ${bot.name}: ${i + 1}/${positions.length}\n`);
      }
      const s = aggregate(bot, samples);
      stats.push(s);
      console.log(
        `${bot.name.padEnd(16)} ${String(bot.elo).padStart(4)}  loss ${s.meanLoss.toFixed(4)}  best ${(s.shares.best * 100).toFixed(1)}%  inacc ${(s.shares.inaccuracy * 100).toFixed(1)}%  mist ${(s.shares.mistake * 100).toFixed(1)}%  blun ${(s.shares.blunder * 100).toFixed(1)}%  compute max ${s.compute.max} ms`,
      );
      saveCache();
    }
  } finally {
    saveCache();
    ref.dispose();
    play.dispose();
  }
  return { stats, positions: positions.length, refDepth, seed, durationSec: (Date.now() - t0) / 1000 };
}

function writeReport(result: ShardResult): void {
  const criteria = checkCriteria(result.stats);
  const ordered = [...result.stats].sort((a, b) => a.elo - b.elo);
  const report = renderReport(ordered, criteria, {
    date: new Date().toISOString().slice(0, 10),
    positions: result.positions,
    games: ['fixture-game (FIXTURE_GAME)', ...CLASSICAL_GAMES.map((g) => g.title)],
    referenceDepth: result.refDepth,
    engineId: NODE_ENGINE_ID,
    seed: result.seed,
    durationSec: result.durationSec,
    parameters: BOT_ROSTER.filter((b) => ordered.some((s) => s.id === b.id)).map(describeParams),
    notes: [
      'Targets are the BACKLOG values (criterion 2: best-move share 25–75 % and (inaccuracies + mistakes) ≥ 2 × blunders for the 800–2000 bots; criterion 3: compute ≤ 1 s, think time 1–8 s); none was changed.',
      'The calibration positions come from master games and a fixture game, so many positions are sharp: absolute loss values are higher than in typical beginner games; the ordering between bots is what the model guarantees.',
      'Measured on a shared 4-core machine while other packages ran; the movetime caps keep compute ≤ 1 s, but under load the searches are shallower, which slightly raises the losses of the stronger bots.',
    ],
  });
  writeFileSync(REPORT, report);
  console.log(`\nwrote ${REPORT}`);
  for (const c of criteria) console.log(`${c.pass ? 'pass' : 'FAIL'}  ${c.id}  ${c.description} – ${c.detail}`);
}

async function main(): Promise<void> {
  const merge = arg('--merge');
  if (merge) {
    const parts = merge.split(',').map((f) => JSON.parse(readFileSync(resolve(f), 'utf8')) as ShardResult);
    const result: ShardResult = {
      stats: parts.flatMap((p) => p.stats),
      positions: Math.min(...parts.map((p) => p.positions)),
      refDepth: parts[0]!.refDepth,
      seed: parts[0]!.seed,
      durationSec: Math.max(...parts.map((p) => p.durationSec)),
    };
    writeReport(result);
    return;
  }
  const ids = arg('--bots')?.split(',');
  const bots = ids ? BOT_ROSTER.filter((b) => ids.includes(b.id)) : BOT_ROSTER;
  if (bots.length === 0) throw new Error(`No bots match ${ids?.join(',')}`);
  const limit = arg('--limit') ? Number(arg('--limit')) : undefined;
  const refDepth = Number(arg('--ref-depth') ?? 14);
  const seed = Number(arg('--seed') ?? 20261016);
  const positions = spread(calibrationPositions(), limit);
  console.log(`bots:calibrate – ${bots.length} bots × ${positions.length} positions, reference depth ${refDepth}`);
  const result = await measure(bots, positions, refDepth, seed);
  const json = arg('--json');
  if (json) writeFileSync(resolve(json), JSON.stringify(result, null, 2));
  if (!process.argv.includes('--no-report')) writeReport(result);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);

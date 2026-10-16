/**
 * `npm run bench:analysis` – analyses the 40-move fixture game (`FIXTURE_GAME`, 80 plies) with the Node engine
 * (Stockfish 19 lite, `@/lib/uci/node`) and the default pipeline settings, and prints the total time (budget: ≤ 30 s,
 * PRD P0-10). Afterwards it times the coach assessment (`assessMove` cold ≤ 1 s, after `prepare` ≤ 500 ms, D-41).
 * Owned by WP-02. Exit code 1 when a budget is exceeded or a position has no best move.
 *
 * Flags: `--verbose` prints every move with eval, loss and classification; `--json <file>` writes the analysis.
 */
import { writeFileSync } from 'node:fs';
import { createAnalysisServiceWithOptions } from '@/analysis';
import type { AnalysisProgress } from '@/core/analysis';
import { FIXTURE_GAME } from '@/core/testing';
import { createNodeEngineService } from '@/lib/uci/node';

const BUDGET_MS = 30_000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const verbose = process.argv.includes('--verbose');
  const engine = createNodeEngineService();
  try {
    const t0 = performance.now();
    await engine.init();
    const initMs = performance.now() - t0;
    const service = createAnalysisServiceWithOptions(engine);
    const progress: AnalysisProgress[] = [];
    const analysis = await service.analyseGame(
      { gameId: 'bench-fixture', startFen: FIXTURE_GAME.startFen, moves: FIXTURE_GAME.moves },
      {
        onProgress: (p) => {
          progress.push(p);
          if (p.phase === 'engine' && p.done % 10 === 0) process.stdout.write(`  … ${p.done}/${p.total} positions\n`);
        },
      },
    );
    const totalMs = performance.now() - t0;
    const missingBest = analysis.moves.filter((m) => !m.bestMove).map((m) => m.ply);
    if (verbose) {
      for (const m of analysis.moves) {
        console.log(
          `${String(m.ply).padStart(2)} ${m.color} ${m.san.padEnd(7)} best ${String(m.bestMoveSan ?? '-').padEnd(7)} ` +
            `win ${m.winPctBefore.toFixed(1).padStart(5)} → ${m.winPctAfter.toFixed(1).padStart(5)} ` +
            `loss ${m.expectedPointsLoss.toFixed(3)} acc ${m.accuracy.toFixed(0).padStart(3)} ${m.classification}` +
            `${m.facts ? ` motifs=[${m.facts.motifs.map((x) => x.id).join(',')}] refutation=${m.facts.refutation.join(' ')}` : ''}`,
        );
      }
    }
    const enginePhase = progress.filter((p) => p.phase === 'engine').length;
    const blunder = analysis.moves[FIXTURE_GAME.blunder.ply - 1];
    console.log(`bench:analysis – FIXTURE_GAME, ${analysis.moves.length} plies, ${enginePhase} engine progress callbacks`);
    console.log(`  engine init ${initMs.toFixed(0)} ms, total ${(totalMs / 1000).toFixed(2)} s (budget ${BUDGET_MS / 1000} s)`);
    console.log(`  target depth ${analysis.depth}, engineVersion ${analysis.engineVersion}`);
    console.log(`  accuracy white ${analysis.accuracy.w.toFixed(1)} %, black ${analysis.accuracy.b.toFixed(1)} %`);
    console.log(`  key moments (plies): ${analysis.keyMoments.join(', ')}`);
    console.log(
      `  ply ${FIXTURE_GAME.blunder.ply} ${blunder?.san}: ${blunder?.classification}, loss ${blunder?.expectedPointsLoss.toFixed(3)}, best ${blunder?.bestMoveSan}`,
    );
    for (const color of ['w', 'b'] as const) {
      const c = analysis.counts[color];
      console.log(
        `  ${color === 'w' ? 'white' : 'black'}: ${Object.entries(c)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k} ${n}`)
          .join(', ')}`,
      );
    }
    // Coach timings (D-41): assessMove cold and after prepare(fenBefore) has finished.
    const coach = createAnalysisServiceWithOptions(engine);
    const qh4 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
    let t = performance.now();
    const cold = await coach.assessMove(qh4, 'd8h4');
    const coldMs = performance.now() - t;
    const qg4 = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    coach.prepare(qg4);
    await new Promise((r) => setTimeout(r, 20));
    while (engine.status().state === 'busy') await new Promise((r) => setTimeout(r, 10));
    t = performance.now();
    const warm = await coach.assessMove(qg4, 'd1g4');
    const warmMs = performance.now() - t;
    console.log(
      `  coach: assessMove cold ${coldMs.toFixed(0)} ms (2…Qh4?? loss ${cold.expectedPointsLoss.toFixed(3)} ${cold.classification}, ` +
        `motifs ${cold.facts.motifs.map((m) => m.id).join(',')}); after prepare ${warmMs.toFixed(0)} ms ` +
        `(2.Qg4?? loss ${warm.expectedPointsLoss.toFixed(3)} ${warm.classification})`,
    );
    const json = arg('--json');
    if (json) writeFileSync(json, JSON.stringify(analysis, null, 2));
    if (missingBest.length > 0) {
      console.error(`  FAIL: no best move at plies ${missingBest.join(', ')}`);
      return 1;
    }
    if (coldMs > 1000 || warmMs > 500) {
      console.error('  FAIL: coach assessment over budget (≤ 1 s cold, ≤ 500 ms after prepare)');
      return 1;
    }
    if (totalMs > BUDGET_MS) {
      console.error(`  FAIL: ${(totalMs / 1000).toFixed(2)} s > ${BUDGET_MS / 1000} s`);
      return 1;
    }
    console.log('  OK');
    return 0;
  } finally {
    engine.dispose();
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`bench:analysis failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(1);
  },
);

/**
 * Authoring helper for lesson content (WP-07): `npx tsx scripts/content/probe.ts [--depth N] [--engine] <fen> [uci …]`.
 *
 * Prints for the position (after the optional UCI moves): legality (`validateFen`), status (`ChessGame.status()`),
 * all legal moves with SAN, immediate mates, and – with `--engine` – a Stockfish MultiPV analysis of every legal move
 * (mate distance or centipawns from the mover's point of view, expected points). Only uses `@/lib/chess` and the Node
 * engine; it never writes files.
 */
import { scoreWinPercent } from '@/analysis';
import { ChessGame, fenTurn, validateFen } from '@/lib/chess';
import { createNodeEngineService } from '@/lib/uci/node';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const depth = Number(arg('--depth') ?? 18);
  const useEngine = process.argv.includes('--engine');
  const rest = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--depth');
  const [fen, ...moves] = rest;
  if (!fen) {
    console.log('usage: probe.ts [--engine] [--depth N] "<fen>" [uci …]');
    return;
  }
  const v = validateFen(fen);
  if (!v.ok) {
    console.log(`illegal FEN: ${v.errorDe}`);
    return;
  }
  const game = ChessGame.fromFen(fen);
  for (const m of moves) {
    const r = game.move(m);
    if (!r) {
      console.log(`illegal move ${m}`);
      return;
    }
    console.log(`${r.uci} ${r.san}`);
  }
  const cur = game.fen();
  const s = game.status();
  console.log(`fen: ${cur}`);
  console.log(`status: over=${s.isOver} reason=${s.reason} inCheck=${s.inCheck} claims=${s.claimableDraws.join(',')}`);
  const legal = game.legalMoves();
  const mates: string[] = [];
  for (const m of legal) {
    const g = ChessGame.fromFen(cur);
    if (g.move(m.uci)?.isCheckmate) mates.push(`${m.uci}(${m.san})`);
  }
  console.log(`legal (${legal.length}): ${legal.map((m) => `${m.uci}=${m.san}`).join(' ')}`);
  console.log(`mates in 1: ${mates.join(' ') || '-'}`);
  if (!useEngine || legal.length === 0) return;
  const engine = createNodeEngineService();
  try {
    await engine.init();
    const turn = fenTurn(cur);
    const t0 = Date.now();
    const a = await engine.analyse(cur, { depth, multiPv: Math.min(legal.length, 60) });
    console.log(`engine depth ${a.depth} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const l of a.lines) {
      const sc = l.score.type === 'mate' ? `M${turn === 'w' ? l.score.value : -l.score.value}` : String(turn === 'w' ? l.score.value : -l.score.value);
      const ep = (scoreWinPercent(l.score, turn, turn) / 100).toFixed(3);
      console.log(`${String(l.multipv).padStart(2)} ${l.pv[0]} ${sc.padStart(6)} ep=${ep}  ${l.pv.slice(0, 8).join(' ')}`);
    }
  } finally {
    engine.dispose();
  }
}

void main();

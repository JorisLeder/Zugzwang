/**
 * Authoring helper (WP-07): `npx tsx scripts/content/probe-batch.ts <file.json> [--depth N] [--pv N]`.
 * The file holds `[{ "id": "…", "fen": "…" }]`; prints legality, status, immediate mates and the engine's top lines
 * (mover's view, expected points) for each position. Read-only.
 */
import { readFileSync } from 'node:fs';
import { scoreWinPercent } from '@/analysis';
import { ChessGame, fenTurn, uciToSan, validateFen } from '@/lib/chess';
import { createNodeEngineService } from '@/lib/uci/node';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('usage: probe-batch.ts <file.json>');
  const depth = Number(arg('--depth') ?? 18);
  const pv = Number(arg('--pv') ?? 4);
  const items = JSON.parse(readFileSync(file, 'utf8')) as Array<{ id: string; fen: string }>;
  const engine = createNodeEngineService();
  await engine.init();
  try {
    for (const { id, fen } of items) {
      const v = validateFen(fen);
      if (!v.ok) {
        console.log(`## ${id}: ILLEGAL ${v.errorDe}`);
        continue;
      }
      const game = ChessGame.fromFen(fen);
      const s = game.status();
      const legal = game.legalMoves();
      const mates = legal.filter((m) => ChessGame.fromFen(fen).move(m.uci)?.isCheckmate).map((m) => m.san);
      console.log(`## ${id}: ${legal.length} legal, over=${s.isOver} ${s.reason ?? ''} check=${s.inCheck} mates=[${mates.join(' ')}]`);
      if (s.isOver || legal.length === 0) continue;
      const turn = fenTurn(fen);
      const a = await engine.analyse(fen, { depth, multiPv: Math.min(pv, legal.length) });
      for (const l of a.lines) {
        const sc = l.score.type === 'mate' ? `M${turn === 'w' ? l.score.value : -l.score.value}` : String(turn === 'w' ? l.score.value : -l.score.value);
        const ep = (scoreWinPercent(l.score, turn, turn) / 100).toFixed(3);
        const sanLine: string[] = [];
        const g = ChessGame.fromFen(fen);
        for (const u of l.pv.slice(0, 6)) {
          const before = g.fen();
          if (!g.move(u)) break;
          sanLine.push(uciToSan(before, u) ?? u);
        }
        console.log(`   ${l.pv[0]} ${sc.padStart(6)} ep=${ep}  ${sanLine.join(' ')}`);
      }
    }
  } finally {
    engine.dispose();
  }
}

void main();

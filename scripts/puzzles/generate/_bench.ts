import { createNodeTransport } from '@/lib/uci/node';
import { createUciEngineService } from '@/lib/uci';
const t = createNodeTransport();
const wrapped = { send(c: string) { if (c.startsWith('position ')) t.send('ucinewgame'); t.send(c); }, onLine: t.onLine, terminate: t.terminate };
const e = createUciEngineService(wrapped, 'x', { initOptions: { Hash: 16 } });
const fens = ['r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 8', '8/5pk1/6p1/3R4/8/6P1/5PK1/3r4 w - - 0 40'];
await e.init();
for (const f of fens) {
  for (const [d, m] of [[8, 5], [10, 4], [18, 2]] as const) {
    const t0 = Date.now();
    const a = await e.analyse(f, { depth: d, multiPv: m });
    console.log(d, m, Date.now() - t0, 'ms', a.lines.map((l) => `${l.pv[0]} ${l.score.type}${l.score.value}`).join(' | '));
  }
}
e.dispose();

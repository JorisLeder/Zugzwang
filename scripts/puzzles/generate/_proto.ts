import { loadOpeningBook } from '@/analysis';
import { createGeneratorEngine } from './engine';
import { playGame, DEFAULT_GENERATOR_CONFIG } from './selfplay';
const book = await loadOpeningBook();
const engines = { screen: createGeneratorEngine('perPuzzle', 16), confirm: createGeneratorEngine('perSearch'), check: createGeneratorEngine('perPuzzle') };
const from = Number(process.argv[2] ?? 0), n = Number(process.argv[3] ?? 3);
let total = 0; const t00 = Date.now();
for (let i = from; i < from + n; i++) {
  const t0 = Date.now();
  const r = await playGame(engines, book, 1, i, DEFAULT_GENERATOR_CONFIG);
  total += r.puzzles.length;
  console.log(`game ${i}: ${r.stats.plies} plies, ${r.stats.mistakes} mist ${JSON.stringify(r.stats.screenedOut)} ${r.stats.candidates} cand, ${r.stats.confirmed} conf, ${r.puzzles.length} ok, ${Date.now() - t0} ms`, JSON.stringify(r.stats.rejected));
  for (const p of r.puzzles) console.log('   ', p.profiles.opponent, '->', p.profiles.solver, p.moves.length, p.mateIn ?? '', 'fd', p.findDepth, p.themes.join(','));
}
console.log('total', total, 'in', Date.now() - t00, 'ms');
engines.screen.dispose(); engines.confirm.dispose(); engines.check.dispose();

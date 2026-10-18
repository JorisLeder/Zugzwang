import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameResult } from './selfplay';
import { ratingFeatures, ratingParts, estimateRating } from './rating';
import { tagPuzzle } from './tagger';
const dir = process.argv[2]!;
const rs: GameResult[] = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const kinds: Record<string, number> = {}; const ratings: number[] = [];
const prof: Record<string, number> = {};
for (const r of rs) for (const p of r.puzzles) {
  const themes = tagPuzzle({ fen: p.fen, moves: p.moves, mateIn: p.mateIn, finalCp: p.finalCp, phase: p.phase });
  const f = ratingFeatures(p.fen, p.moves, p.mateIn, p.findDepth, themes);
  const k = `${p.mateIn ? 'm' + p.mateIn : 'adv' + f.solverMoves}`;
  kinds[k] = (kinds[k] ?? 0) + 1;
  prof[`${p.profiles.opponent}->${p.profiles.solver}`] = (prof[`${p.profiles.opponent}->${p.profiles.solver}`] ?? 0) + 1;
  ratings.push(estimateRating(f, p.fen));
  if (process.argv[3]) console.log(k, f.findDepth, f.firstMove, f.legalMoves, themes.join(','), JSON.stringify(ratingParts(f)));
}
console.log(rs.length, 'games', ratings.length, 'puzzles');
console.log(kinds); console.log(prof);
const bands = [600, 1000, 1400, 2000, 9999]; console.log(bands.map((b, i) => ratings.filter((r) => r <= b && r > (bands[i - 1] ?? 0)).length));

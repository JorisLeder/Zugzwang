import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameResult } from './selfplay';
import { ratingFeatures, estimateRating } from './rating';
import { tagPuzzle } from './tagger';
const dir = process.argv[2]!;
const rs: GameResult[] = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const by: Record<string, { n: number; hard: number; plies: number; games: number }> = {};
for (const r of rs) {
  for (const p of r.puzzles) {
    const themes = tagPuzzle({ fen: p.fen, moves: p.moves, mateIn: p.mateIn, finalCp: p.finalCp, phase: p.phase });
    const rt = estimateRating(ratingFeatures(p.fen, p.moves, p.mateIn, p.findDepth, themes), p.fen);
    const k = p.profiles.opponent;
    by[k] ??= { n: 0, hard: 0, plies: 0, games: 0 };
    by[k].n++; if (rt > 600) by[k].hard++;
  }
}
console.log(by);

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Puzzle } from '@/core/puzzles';
import type { GameResult } from './selfplay';
import { createAccumulator } from './index';
import { isSkip, lessonPuzzle, readLessonExercises } from './lessons';
const dir = process.argv[2]!;
const seed = JSON.parse(readFileSync('public/data/puzzles/seed.json', 'utf8')) as Puzzle[];
const lessons = readLessonExercises(process.cwd()).map(lessonPuzzle).filter((p): p is Puzzle => !isSkip(p));
const acc = createAccumulator(700, [...seed, ...lessons]);
let i = 0; let done = false;
while (existsSync(join(dir, `game-${i}.json`))) {
  done = acc.add(JSON.parse(readFileSync(join(dir, `game-${i}.json`), 'utf8')) as GameResult);
  i++;
  if (done) break;
}
console.log('games', i, 'done', done, 'generated', acc.generated.length, acc.stats().bands.map((b) => `${b.id}:${b.count}`).join(' '), 'themes', acc.themeStats().trainableWithContent.length);

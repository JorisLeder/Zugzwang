/**
 * The Stockfish 19 lite single-threaded engine is served from /engine/ (scripts/copy-engine.mjs) and runs as a
 * Web Worker in Chromium: a real "go depth 10" returns a best move, and the mate in one is found.
 */
import { expect, test } from '../support/fixtures';

test('stockfish web worker answers "go depth 10"', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(
    () =>
      new Promise<{ best: string; mate: string; info: string }>((resolve, reject) => {
        const worker = new Worker('/engine/stockfish-19-lite-single.js');
        const timer = setTimeout(() => reject(new Error('engine timeout')), 20_000);
        let best = '';
        let info = '';
        worker.onmessage = (e: MessageEvent) => {
          const line = String(e.data);
          if (line.startsWith('info depth 10 ')) info = line;
          if (!line.startsWith('bestmove')) return;
          if (!best) {
            best = line.split(' ')[1] ?? '';
            worker.postMessage('position fen 6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
            worker.postMessage('go depth 10');
          } else {
            clearTimeout(timer);
            worker.terminate();
            resolve({ best, mate: line.split(' ')[1] ?? '', info });
          }
        };
        worker.onerror = (e) => reject(new Error(e.message));
        worker.postMessage('uci');
        worker.postMessage('isready');
        worker.postMessage('position startpos');
        worker.postMessage('go depth 10');
      }),
  );
  expect(result.best).toMatch(/^[a-h][1-8][a-h][1-8]$/);
  expect(result.info).toContain(' pv ');
  expect(result.mate).toBe('d1d8');
});

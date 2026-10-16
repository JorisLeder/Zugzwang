#!/usr/bin/env node
/**
 * Copies the Stockfish 19 lite single-threaded engine (js + wasm) from node_modules/stockfish/bin to public/engine/
 * so the browser can load it as a Web Worker (`/engine/stockfish-19-lite-single.js`). Skips identical files.
 * public/engine/ is git-ignored. Runs before `dev`, `build` and the e2e servers. Owned by WP-00.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', 'stockfish', 'bin');
const outDir = join(root, 'public', 'engine');
const FILES = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

mkdirSync(outDir, { recursive: true });
let copied = 0;
for (const name of FILES) {
  const from = join(srcDir, name);
  const to = join(outDir, name);
  if (!existsSync(from)) {
    console.error(`copy-engine: missing ${from} – run npm install`);
    process.exit(1);
  }
  if (existsSync(to) && hash(from) === hash(to)) continue;
  copyFileSync(from, to);
  copied += 1;
}
console.log(copied ? `copy-engine: copied ${copied} file(s) to public/engine/` : 'copy-engine: public/engine/ is up to date');

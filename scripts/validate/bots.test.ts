import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOT_ROSTER } from '@/bots';
import type { BotProfile } from '@/core/bots';
import type { ValidationCache, ValidationContext } from '../lib/validation';
import validateBots, { checkAvatar, checkLine, expectedEngines, repertoireLimits, validateRoster } from './bots';

const ROOT = resolve(__dirname, '..', '..');

function memoryCache(): ValidationCache {
  const m = new Map<string, unknown>();
  return {
    key: (c, v) => `${v}:${c}`,
    get: <T>(k: string) => m.get(k) as T | undefined,
    set: (k, v) => void m.set(k, v),
    async getOrCompute<T>(k: string, compute: () => Promise<T>) {
      if (!m.has(k)) m.set(k, await compute());
      return m.get(k) as T;
    },
  };
}

describe('bots validator – structure', () => {
  it('the shipped roster has no errors', () => {
    const r = validateRoster(BOT_ROSTER, ROOT);
    expect(r.errors).toEqual([]);
    expect(r.lines.length).toBeGreaterThanOrEqual(BOT_ROSTER.length * 4);
  });

  it('reports too few bots, too few weak bots, unsorted and wrong engines', () => {
    const few = BOT_ROSTER.slice(6);
    const msgs = validateRoster(few, ROOT).errors.map((e) => e.message).join('\n');
    expect(msgs).toMatch(/Mindestens 10 Bots/);
    expect(msgs).toMatch(/Mindestens 4 Bots unter 800/);
    const broken: BotProfile[] = [{ ...BOT_ROSTER[1]!, engine: 'stockfish-elo' }, BOT_ROSTER[0]!, ...BOT_ROSTER.slice(2)];
    const msgs2 = validateRoster(broken, ROOT).errors.map((e) => e.message).join('\n');
    expect(msgs2).toMatch(/sortiert/);
    expect(msgs2).toMatch(/passt nicht zu 250 Elo/);
  });

  it('reports missing chat lines and repertoire counts', () => {
    const bot: BotProfile = { ...BOT_ROSTER[0]!, chat: { ...BOT_ROSTER[0]!.chat, onDraw: [] }, repertoire: { white: [['e4']], black: BOT_ROSTER[0]!.repertoire.black } };
    const msgs = validateRoster([bot], ROOT).errors.map((e) => e.message).join('\n');
    expect(msgs).toMatch(/onDraw/);
    expect(msgs).toMatch(/2–4 Linien/);
  });

  it('checkLine: illegal moves, non-canonical SAN, lines without a bot move and finished games', () => {
    const bot = BOT_ROSTER[0]!;
    expect(checkLine(bot, 'w', ['e4', 'e5']).issues).toEqual([]);
    expect(checkLine(bot, 'w', ['e5']).issues[0]).toMatch(/nicht legal/);
    expect(checkLine(bot, 'w', ['e4', 'e5', 'Ng1f3']).issues[0]).toMatch(/englische SAN/);
    expect(checkLine(bot, 'b', ['e4']).issues[0]).toMatch(/keinen Zug von Schwarz/);
    expect(checkLine(bot, 'b', ['f3', 'e5', 'g4', 'Qh4#']).issues.join()).toMatch(/Ende der Partie/);
  });

  it('checkAvatar: missing files, scripts and external references', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zz-avatars-'));
    mkdirSync(join(dir, 'public', 'avatars', 'bots'), { recursive: true });
    writeFileSync(join(dir, 'public/avatars/bots/ok.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
    writeFileSync(join(dir, 'public/avatars/bots/evil.svg'), '<svg viewBox="0 0 1 1"><script>alert(1)</script><image href="https://x.org/a.png"/></svg>');
    expect(checkAvatar(dir, '/avatars/bots/ok.svg')).toEqual([]);
    const evil = checkAvatar(dir, '/avatars/bots/evil.svg').join('\n');
    expect(evil).toMatch(/Skripte/);
    expect(evil).toMatch(/externen/);
    expect(checkAvatar(dir, '/avatars/bots/missing.svg')[0]).toMatch(/fehlt/);
    expect(checkAvatar(dir, '/img/x.png')[0]).toMatch(/muss/);
  });

  it('engine bands and repertoire limits', () => {
    expect(expectedEngines(100)).toEqual(['stockfish-skill']);
    expect(expectedEngines(1400)).toContain('maia');
    expect(expectedEngines(2500)).toEqual(['stockfish-elo']);
    expect(repertoireLimits(400).errorBelowCp).toBeLessThan(repertoireLimits(1400).errorBelowCp);
  });
});

describe('bots validator – entry', () => {
  it('quick mode skips the engine and passes', async () => {
    const ctx: ValidationContext = {
      rootDir: ROOT,
      quick: true,
      engine: () => Promise.reject(new Error('no engine in quick mode')),
      engineId: 'test',
      cache: memoryCache(),
      log: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const r = await validateBots(ctx);
    expect(r.errors).toEqual([]);
    expect(r.checked).toBeGreaterThan(BOT_ROSTER.length);
  });
});

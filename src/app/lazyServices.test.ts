import { describe, expect, it, vi } from 'vitest';
import type { AnalysisService } from '@/core/analysis';
import type { BotEngine, BotMoveRequest } from '@/core/bots';
import { lazyAnalysisService, lazyBotEngine, lazyLoader } from './services';

describe('lazy services', () => {
  it('loads once, shares the pending load and retries after a failed import', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('module');
    const get = lazyLoader(load);
    await expect(get()).rejects.toThrow('offline');
    const [a, b] = await Promise.all([get(), get()]);
    expect([a, b]).toEqual(['module', 'module']);
    await get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('AnalysisService: nothing loads before the first call; prepare runs before a later assessMove', async () => {
    const calls: string[] = [];
    const impl = {
      prepare: (fen: string) => calls.push(`prepare ${fen}`),
      analyseGame: vi.fn(),
      assessMove: async (fen: string, move: string) => {
        calls.push(`assess ${fen} ${move}`);
        return { fen, move };
      },
      findThreats: async () => null,
    } as unknown as AnalysisService;
    const load = vi.fn(async () => impl);
    const service = lazyAnalysisService(load);
    expect(load).not.toHaveBeenCalled();
    service.prepare('F');
    await expect(service.assessMove('F', 'e2e4')).resolves.toEqual({ fen: 'F', move: 'e2e4' });
    expect(calls).toEqual(['prepare F', 'assess F e2e4']);
    await expect(service.findThreats('F')).resolves.toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('AnalysisService: a failed load rejects the call (and prepare stays silent)', async () => {
    const service = lazyAnalysisService(async () => {
      throw new Error('chunk failed');
    });
    expect(() => service.prepare('F')).not.toThrow();
    await expect(service.findThreats('F')).rejects.toThrow('chunk failed');
  });

  it('BotEngine: delegates after loading', async () => {
    const impl: BotEngine = {
      chooseMove: async () => ({ uci: 'e7e5', source: 'engine', thinkTimeMs: 0, computeMs: 5 }),
      shouldClaimDraw: async () => true,
    };
    const bots = lazyBotEngine(async () => impl);
    await expect(bots.chooseMove({} as BotMoveRequest)).resolves.toMatchObject({ uci: 'e7e5' });
    await expect(bots.shouldClaimDraw('F', {} as BotMoveRequest['bot'])).resolves.toBe(true);
  });
});

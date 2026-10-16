// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readAppConfig } from '@/app/config';
import { createEngineService } from './index';

describe('createEngineService in jsdom (no Worker, D-51)', () => {
  it('constructs without a worker; init rejects with "Engine nicht verfügbar"', async () => {
    expect(typeof window).toBe('object');
    expect(typeof Worker).toBe('undefined');
    const engine = createEngineService('analysis', readAppConfig({}));
    expect(engine.status()).toEqual({ state: 'idle' });
    await expect(engine.init()).rejects.toThrow('Engine nicht verfügbar');
    expect(engine.status()).toEqual({ state: 'error', error: 'Engine nicht verfügbar' });
    await expect(engine.bestMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).rejects.toThrow();
    engine.dispose();
  });
});

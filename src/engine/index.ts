/**
 * `@/engine` – browser engine factory (D-03, D-27). PLACEHOLDER written by WP-00: returns a fake engine.
 * WP-02 replaces it with the Stockfish Web Worker (`public/engine/stockfish-19-lite-single.js`) via
 * `createUciEngineService` WITHOUT changing the signature.
 */
import type { EngineService } from '@/core/engine';
import type { AppConfig } from '@/core/services';
import { FakeEngineService } from '@/core/testing';

/** Creates one engine instance per role: `play` (bots, coach, hints) and `analysis` (review, analysis board). */
export function createEngineService(role: 'play' | 'analysis', config: AppConfig): EngineService {
  void config;
  return new FakeEngineService({ id: `placeholder-${role}` });
}

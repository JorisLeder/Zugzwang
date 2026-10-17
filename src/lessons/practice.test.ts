import { describe, expect, it } from 'vitest';
import type { BotProfile } from '@/core/bots';
import { FIXTURE_BOTS } from '@/core/testing';
import { MAX_PLAY_OUT_ELO, playOutBot, practiceBot } from './practice';

function bot(id: string, elo: number): BotProfile {
  return { ...FIXTURE_BOTS[0]!, id, name: id, elo };
}

const ROSTER = [bot('a', 100), bot('b', 400), bot('c', 700), bot('d', 1000), bot('e', 1400), bot('f', 2200)];

describe('practiceBot (Übungspartie)', () => {
  it('picks the bot nearest to the bot rating (ties → weaker bot)', () => {
    expect(practiceBot(ROSTER, 760, 1)!.id).toBe('c');
    expect(practiceBot(ROSTER, 850, 0)!.id).toBe('c');
    expect(practiceBot(ROSTER, 1900, 0)!.id).toBe('f');
  });

  it('without a bot rating: Stufe 0 → the weakest bot, other stages → nearest to the Elo range', () => {
    expect(practiceBot(ROSTER, null, 0)!.id).toBe('a');
    // Stufe 1 = 400–800: the weakest bot inside the range.
    expect(practiceBot(ROSTER, null, 1)!.id).toBe('b');
    // Stufe 3 = 1200–1600.
    expect(practiceBot(ROSTER, null, 3)!.id).toBe('e');
  });

  it('returns null for an empty roster', () => {
    expect(practiceBot([], 800, 1)).toBeNull();
  });
});

describe('playOutBot (Ausspielen)', () => {
  it('uses the nearest bot with the exact Elo of the step and no repertoire', () => {
    const b = playOutBot(ROSTER, 650)!;
    expect(b.id).toBe('c');
    expect(b.elo).toBe(650);
    expect(b.repertoire).toEqual({ white: [], black: [] });
  });

  it('max → the strongest bot on the Elo model at full strength', () => {
    const b = playOutBot(ROSTER, 'max')!;
    expect(b.id).toBe('f');
    expect(b.engine).toBe('stockfish-elo');
    expect(b.elo).toBe(MAX_PLAY_OUT_ELO);
  });

  it('returns null for an empty roster', () => {
    expect(playOutBot([], 'max')).toBeNull();
    expect(playOutBot([], 800)).toBeNull();
  });
});

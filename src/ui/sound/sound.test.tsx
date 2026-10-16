import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/app/services';
import { DEFAULT_SETTINGS } from '@/core/profile';
import { FakeAudioContext } from './fakeAudio';
import { playSound, soundForMove } from './index';

beforeAll(() => vi.stubGlobal('AudioContext', FakeAudioContext));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => FakeAudioContext.reset());

function setSound(on: boolean) {
  useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, sound: on });
}

describe('playSound', () => {
  it('plays all five sounds when "Töne" is on', async () => {
    setSound(true);
    for (const kind of ['move', 'capture', 'check', 'success', 'error'] as const) {
      const before = FakeAudioContext.started.length;
      playSound(kind);
      expect(FakeAudioContext.started.length, kind).toBeGreaterThan(before);
    }
  });

  it('never plays when "Töne" is off', async () => {
    setSound(false);
    for (const kind of ['move', 'capture', 'check', 'success', 'error'] as const) playSound(kind);
    expect(FakeAudioContext.started).toHaveLength(0);
    setSound(true);
  });
});

describe('soundForMove', () => {
  it('maps check over capture over move (DESIGN §6.2)', () => {
    expect(soundForMove({ isCheck: false })).toBe('move');
    expect(soundForMove({ isCheck: false, captured: 'p' })).toBe('capture');
    expect(soundForMove({ isCheck: true, captured: 'q' })).toBe('check');
    expect(soundForMove({ isCheck: true })).toBe('check');
  });
});

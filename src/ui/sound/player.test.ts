import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioContext } from './fakeAudio';
import { DUPLICATE_WINDOW_MS, SoundPlayer, type AudioContextLike } from './player';
import { SOUND_RECIPES, soundDuration, type SoundKind } from './recipes';

const KINDS: SoundKind[] = ['move', 'capture', 'check', 'success', 'error'];

function setup(overrides: Partial<ConstructorParameters<typeof SoundPlayer>[0]> = {}) {
  let enabled = true;
  let clock = 1000;
  const contexts: FakeAudioContext[] = [];
  const player = new SoundPlayer({
    createContext: () => {
      const ctx = new FakeAudioContext();
      contexts.push(ctx);
      return ctx as unknown as AudioContextLike;
    },
    isEnabled: () => enabled,
    now: () => clock,
    ...overrides,
  });
  return {
    player,
    contexts,
    setEnabled: (v: boolean) => (enabled = v),
    tick: (ms: number) => (clock += ms),
  };
}

beforeEach(() => FakeAudioContext.reset());

describe('SoundPlayer', () => {
  it.each(KINDS)('plays %s when enabled', (kind) => {
    const { player } = setup();
    expect(player.play(kind)).toBe(true);
    expect(FakeAudioContext.started.length).toBe(SOUND_RECIPES[kind].length);
  });

  it('never plays when sounds are disabled (and does not even create a context)', () => {
    const { player, contexts, setEnabled } = setup();
    setEnabled(false);
    for (const kind of KINDS) expect(player.play(kind)).toBe(false);
    expect(FakeAudioContext.started).toHaveLength(0);
    expect(contexts).toHaveLength(0);
  });

  it('follows the setting at call time', () => {
    const { player, setEnabled, tick } = setup();
    expect(player.play('move')).toBe(true);
    setEnabled(false);
    tick(500);
    expect(player.play('move')).toBe(false);
    setEnabled(true);
    tick(500);
    expect(player.play('move')).toBe(true);
  });

  it('waits for a user gesture (autoplay rules)', () => {
    let active = false;
    const { player, contexts } = setup({ canStart: () => active });
    expect(player.play('success')).toBe(false);
    expect(contexts).toHaveLength(0);
    active = true;
    expect(player.play('success')).toBe(true);
  });

  it('plays an identical sound only once within the duplicate window, different sounds always', () => {
    const { player, tick } = setup();
    expect(player.play('move')).toBe(true);
    expect(player.play('move')).toBe(false);
    expect(player.play('success')).toBe(true);
    tick(DUPLICATE_WINDOW_MS);
    expect(player.play('move')).toBe(true);
  });

  it('is a silent no-op without Web Audio and when the context cannot be created', () => {
    const missing = new SoundPlayer({ createContext: () => null, isEnabled: () => true });
    expect(missing.play('move')).toBe(false);
    const throwing = new SoundPlayer({
      createContext: () => {
        throw new Error('no audio');
      },
      isEnabled: () => true,
    });
    expect(() => throwing.play('check')).not.toThrow();
    expect(throwing.play('check')).toBe(false);
  });

  it('reuses one context and resumes a suspended one', () => {
    const { player, contexts, tick } = setup();
    player.play('move');
    contexts[0]!.state = 'suspended';
    tick(100);
    player.play('capture');
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.resumeCalls).toBe(1);
  });
});

describe('recipes (DESIGN §6.2 lengths)', () => {
  it('keeps every sound short', () => {
    expect(soundDuration('move')).toBeLessThanOrEqual(0.08);
    expect(soundDuration('success')).toBeLessThanOrEqual(0.3);
    expect(soundDuration('error')).toBeLessThanOrEqual(0.25);
    expect(soundDuration('capture')).toBeLessThanOrEqual(0.2);
    expect(soundDuration('check')).toBeLessThanOrEqual(0.2);
  });

  it('capture is a double click and louder than a move; success rises; error falls', () => {
    const clicks = (k: SoundKind) => SOUND_RECIPES[k].filter((p) => p.type === 'noise');
    expect(clicks('capture')).toHaveLength(2);
    expect(Math.max(...clicks('capture').map((p) => p.gain))).toBeGreaterThan(Math.max(...clicks('move').map((p) => p.gain)));
    const tones = (k: SoundKind) => SOUND_RECIPES[k].flatMap((p) => (p.type === 'tone' ? [p.freq] : []));
    const [s1, s2] = tones('success');
    expect(s2!).toBeGreaterThan(s1!);
    const [e1, e2] = tones('error');
    expect(e2!).toBeLessThan(e1!);
    expect(Math.max(...tones('error'))).toBeLessThan(300);
  });
});

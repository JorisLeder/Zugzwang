/**
 * Minimal fake `AudioContext` for tests (jsdom and Node have no Web Audio). Records every started source so tests can
 * assert that a sound was (or was not) played. Install globally with
 * `vi.stubGlobal('AudioContext', FakeAudioContext)` or pass `() => new FakeAudioContext()` to `SoundPlayer`.
 */

/** Global log of started sources across all fake contexts (reset with `FakeAudioContext.reset()`). */
const started: Array<{ kind: 'oscillator' | 'buffer'; at: number; wave?: string; freq?: number }> = [];

function fakeParam(initial = 0) {
  return {
    value: initial,
    setValueAtTime(v: number) {
      this.value = v;
      return this;
    },
    linearRampToValueAtTime(v: number) {
      this.value = v;
      return this;
    },
    exponentialRampToValueAtTime(v: number) {
      this.value = v;
      return this;
    },
  };
}

const node = () => ({ connect: () => undefined, disconnect: () => undefined });

/** Fake Web Audio context. */
export class FakeAudioContext {
  /** Every started oscillator/buffer source. */
  static get started() {
    return started;
  }
  /** Clears the log. */
  static reset(): void {
    started.length = 0;
  }

  currentTime = 0;
  sampleRate = 8000;
  state: AudioContextState = 'running';
  destination = node();
  resumeCalls = 0;

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  createGain() {
    return { ...node(), gain: fakeParam(1) };
  }

  createBiquadFilter() {
    return { ...node(), type: 'lowpass', frequency: fakeParam(350), Q: fakeParam(1) };
  }

  createOscillator() {
    const osc = {
      ...node(),
      type: 'sine',
      frequency: fakeParam(440),
      start: (at: number) => started.push({ kind: 'oscillator', at, wave: osc.type, freq: osc.frequency.value }),
      stop: () => undefined,
    };
    return osc;
  }

  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }

  createBufferSource() {
    return {
      ...node(),
      buffer: null as unknown,
      start: (at: number) => started.push({ kind: 'buffer', at }),
      stop: () => undefined,
    };
  }
}

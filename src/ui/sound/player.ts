/**
 * `SoundPlayer` – schedules the synthesised recipes on a lazily created `AudioContext`.
 * Never throws: without Web Audio (jsdom, Node, old browsers) or before the first user gesture it does nothing.
 */
import { SOUND_RECIPES, type SoundKind, type SoundPart } from './recipes';

/** The part of `AudioContext` the player uses (tests pass a fake). */
export type AudioContextLike = Pick<
  AudioContext,
  | 'currentTime'
  | 'state'
  | 'destination'
  | 'sampleRate'
  | 'resume'
  | 'createOscillator'
  | 'createGain'
  | 'createBiquadFilter'
  | 'createBuffer'
  | 'createBufferSource'
>;

/** Options of `SoundPlayer`. */
export interface SoundPlayerOptions {
  /** Creates the audio context (called once, on the first sound). Return `null` when Web Audio is unavailable. */
  createContext: () => AudioContextLike | null;
  /** Whether sounds are switched on (`settings.sound`). Read on every call. */
  isEnabled: () => boolean;
  /** Whether audio may start (browser autoplay rules: after a user gesture). Default: always. */
  canStart?: () => boolean;
  /** Master volume 0–1 (DESIGN §6.2: 70 %). */
  volume?: number;
  /** Clock in ms for the duplicate filter (tests). */
  now?: () => number;
}

/** Identical sounds requested within this window (ms) play once (board and caller may both report a move). */
export const DUPLICATE_WINDOW_MS = 60;

/** Plays the five app sounds. */
export class SoundPlayer {
  private context: AudioContextLike | null = null;
  private noise: AudioBuffer | null = null;
  private readonly lastPlayed = new Map<SoundKind, number>();
  private readonly opts: SoundPlayerOptions;

  constructor(opts: SoundPlayerOptions) {
    this.opts = opts;
  }

  /** Plays `kind`; returns whether anything was scheduled. */
  play(kind: SoundKind): boolean {
    try {
      if (!this.opts.isEnabled()) return false;
      if (this.opts.canStart && !this.opts.canStart()) return false;
      const now = (this.opts.now ?? Date.now)();
      const last = this.lastPlayed.get(kind);
      if (last !== undefined && now - last < DUPLICATE_WINDOW_MS) return false;
      const ctx = this.ensureContext();
      if (!ctx) return false;
      this.lastPlayed.set(kind, now);
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      const master = ctx.createGain();
      master.gain.value = this.opts.volume ?? 0.7;
      master.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.005;
      for (const part of SOUND_RECIPES[kind]) this.schedule(ctx, master, part, t0);
      return true;
    } catch {
      // Audio is a nice-to-have: never break a move because of it.
      return false;
    }
  }

  /** Creates the context on first use; retries later if Web Audio was unavailable (cheap: a global lookup). */
  private ensureContext(): AudioContextLike | null {
    if (this.context) return this.context;
    try {
      this.context = this.opts.createContext();
    } catch {
      this.context = null;
    }
    return this.context;
  }

  private noiseBuffer(ctx: AudioContextLike): AudioBuffer {
    if (!this.noise) {
      const length = Math.max(1, Math.floor(ctx.sampleRate * 0.1));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    return this.noise;
  }

  private schedule(ctx: AudioContextLike, out: AudioNode, part: SoundPart, t0: number): void {
    const start = t0 + part.start;
    const end = start + part.duration;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(part.gain, start + Math.min(0.005, part.duration / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(out);
    if (part.type === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = part.wave;
      osc.frequency.setValueAtTime(part.freq, start);
      if (part.freqEnd) osc.frequency.exponentialRampToValueAtTime(part.freqEnd, end);
      osc.connect(env);
      osc.start(start);
      osc.stop(end + 0.02);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = part.filterFreq;
    filter.Q.value = part.q;
    src.connect(filter);
    filter.connect(env);
    src.start(start);
    src.stop(end + 0.02);
  }
}

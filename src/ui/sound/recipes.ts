/**
 * Synthesised sound recipes (DESIGN §6.2): our own sounds, built at runtime with the Web Audio API – no audio files.
 * Each sound is a short list of parts scheduled relative to "now" (seconds).
 *
 * - Zug (`move`): short soft wooden click (≤ 80 ms) – band-passed noise burst plus a low thump.
 * - Schlag (`capture`): slightly louder double click.
 * - Schach (`check`): click plus a short high tone.
 * - Erfolg (`success`): two rising notes (≤ 300 ms).
 * - Fehler (`error`): soft low double tone, not a buzzer (≤ 250 ms).
 */

/** The five sounds (PRD): Zug, Schlag, Schach, Erfolg, Fehler. */
export type SoundKind = 'move' | 'capture' | 'check' | 'success' | 'error';

/** An oscillator tone with an attack/decay envelope. */
export interface TonePart {
  type: 'tone';
  wave: OscillatorType;
  /** Start frequency in Hz. */
  freq: number;
  /** Optional end frequency (exponential glide). */
  freqEnd?: number;
  /** Start offset in seconds. */
  start: number;
  /** Duration in seconds (envelope reaches silence at the end). */
  duration: number;
  /** Peak gain (before the master volume). */
  gain: number;
}

/** A band-passed white-noise burst (the "wooden" click). */
export interface NoisePart {
  type: 'noise';
  /** Band-pass centre frequency in Hz. */
  filterFreq: number;
  /** Band-pass Q. */
  q: number;
  start: number;
  duration: number;
  gain: number;
}

/** One scheduled part of a sound. */
export type SoundPart = TonePart | NoisePart;

const click = (start: number, gain: number): SoundPart[] => [
  { type: 'noise', filterFreq: 1900, q: 1.1, start, duration: 0.035, gain },
  { type: 'tone', wave: 'sine', freq: 230, freqEnd: 120, start, duration: 0.06, gain: gain * 0.6 },
];

/** Parts per sound kind. */
export const SOUND_RECIPES: Record<SoundKind, SoundPart[]> = {
  move: click(0, 0.8),
  capture: [...click(0, 1), ...click(0.07, 0.9)],
  check: [...click(0, 0.8), { type: 'tone', wave: 'sine', freq: 1046.5, start: 0.035, duration: 0.12, gain: 0.3 }],
  success: [
    { type: 'tone', wave: 'triangle', freq: 523.25, start: 0, duration: 0.14, gain: 0.45 },
    { type: 'tone', wave: 'triangle', freq: 783.99, start: 0.12, duration: 0.17, gain: 0.45 },
  ],
  error: [
    { type: 'tone', wave: 'sine', freq: 233.08, start: 0, duration: 0.1, gain: 0.4 },
    { type: 'tone', wave: 'sine', freq: 196, start: 0.12, duration: 0.11, gain: 0.4 },
  ],
};

/** Total length of a sound in seconds (end of its last part). */
export function soundDuration(kind: SoundKind): number {
  return Math.max(...SOUND_RECIPES[kind].map((p) => p.start + p.duration));
}

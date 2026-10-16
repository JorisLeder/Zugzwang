/**
 * `@/ui/sound` – the five app sounds (PRD: Zug, Schlag, Schach, Erfolg, Fehler; DESIGN §6.2), synthesised with the
 * Web Audio API at runtime (no audio files). Respects `settings.sound` on every call, starts audio only after a user
 * gesture (autoplay rules) and is a silent no-op without `AudioContext` (tests, Node).
 *
 * Who plays what: the `Board` plays the move sound for moves the user makes on it (`sound` prop, default on).
 * Callers play sounds for everything else – opponent/bot/demo moves (`playSound(soundForMove(move))`),
 * `success` (puzzle solved, lesson/daily goal completed, game won) and `error` (wrong puzzle/lesson move).
 * No sound for illegal drops, coach warnings, rating loss, navigation or toasts.
 * Identical sounds requested within 60 ms play once, so a double report never doubles the volume.
 */
import { useSettingsStore } from '@/app/services';
import { SoundPlayer, type AudioContextLike } from './player';
import type { SoundKind } from './recipes';

export type { SoundKind } from './recipes';

function createBrowserAudioContext(): AudioContextLike | null {
  const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/** Autoplay rule: audio may only start after the user interacted with the page (unknown = allowed). */
function hasUserActivation(): boolean {
  if (typeof navigator === 'undefined') return false;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}

const player = new SoundPlayer({
  createContext: createBrowserAudioContext,
  isEnabled: () => useSettingsStore.getState().settings.sound,
  canStart: hasUserActivation,
  volume: 0.7,
});

/** Plays a sound when "Töne" is on (never throws; no-op without Web Audio). */
export function playSound(kind: SoundKind): void {
  player.play(kind);
}

/** Sound for a played move: check replaces move/capture; captures (incl. en passant) → Schlag (DESIGN §6.2). */
export function soundForMove(move: { isCheck: boolean; captured?: string }): SoundKind {
  if (move.isCheck) return 'check';
  return move.captured ? 'capture' : 'move';
}

/**
 * `@/ui/sound` – PLACEHOLDER (WP-00) with the final signature; WP-01 synthesises the five sounds with WebAudio
 * (DESIGN §6.2) and respects `settings.sound`. No-op for now.
 */

/** The five sounds (PRD): Zug, Schlag, Schach, Erfolg, Fehler. */
export type SoundKind = 'move' | 'capture' | 'check' | 'success' | 'error';

/** Plays a sound (no-op placeholder; never throws, works without AudioContext). */
export function playSound(kind: SoundKind): void {
  void kind;
}

/** Sound for a played move: check replaces move/capture (DESIGN §6.2). */
export function soundForMove(move: { isCheck: boolean; captured?: string }): SoundKind {
  if (move.isCheck) return 'check';
  return move.captured ? 'capture' : 'move';
}

/** Per-viewer conveniences of the Analysebrett in localStorage (DESIGN §3.5: active tab per screen; engine toggle). */

const PREFIX = 'zz-analysis-board:';

/** Reads a stored string (null when missing or storage is unavailable). */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** Stores a string; silently ignores unavailable storage (private mode). */
export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Convenience only.
  }
}

/** Small helpers of the auth feature (no components – fast refresh). */
import type { AuthErrorCode } from '@/data/auth/authService';
import { STRINGS_DE } from './strings.de';

const NEXT_KEY = 'zz-after-login';

/** Remembers the page a logged-out user wanted to open (restored after the login). */
export function rememberNextPath(path: string): void {
  try {
    sessionStorage.setItem(NEXT_KEY, path);
  } catch {
    // Storage unavailable: the user lands on the start page after the login.
  }
}

/** The remembered page without consuming it (safe during render), or `fallback`. Only same-origin paths. */
export function peekNextPath(fallback: string): string {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  } catch {
    // ignore
  }
  return fallback;
}

/** The remembered page (once), or `fallback`. */
export function takeNextPath(fallback: string): string {
  const next = peekNextPath(fallback);
  try {
    sessionStorage.removeItem(NEXT_KEY);
  } catch {
    // ignore
  }
  return next;
}

/** German message of an auth failure. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: AuthErrorCode } | null)?.code;
  return code && code in STRINGS_DE.errors ? STRINGS_DE.errors[code] : STRINGS_DE.errors.unknown;
}

/** Starts a browser download of `blob`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File name of the data export (`zugzwang-export-YYYY-MM-DD.json`). */
export function exportFileName(at: Date = new Date()): string {
  return `zugzwang-export-${at.toISOString().slice(0, 10)}.json`;
}

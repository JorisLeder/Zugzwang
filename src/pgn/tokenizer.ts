/**
 * PGN tokenizer (PGN standard §7 "Tokens", import format) with line/column tracking for German diagnostics (P0-15).
 *
 * Input is normalised first: a UTF-8 byte order mark is dropped (also at the start of any line, e.g. concatenated
 * files) and CRLF/CR line breaks become LF – so line numbers match what the learner sees in an editor.
 * Tokens: `[` `]` `(` `)` `.`, strings (`"…"` with `\"`/`\\` escapes, single line), symbols (letters, digits and
 * `_+#=:-/`), NAGs (`$12`), move suffix annotations (`!`, `?`, `!!`, `?!` …, returned as NAGs), results
 * (`1-0`, `0-1`, `1/2-1/2`, `½-½`, `*`) and comments (`{…}` over several lines, `;` to the end of the line).
 * Lines starting with `%` are escape lines and ignored. Anything else is reported as an unexpected character.
 */
import type { GameResult } from '@/core/chess';
import { PGN_DE } from './strings.de';

/** Position of a token or diagnostic (1-based). */
export interface PgnPosition {
  line: number;
  column: number;
}

/** One token. */
export type PgnToken = PgnPosition &
  (
    | { type: 'tagOpen' | 'tagClose' | 'varOpen' | 'varClose' | 'period' }
    | { type: 'string'; value: string }
    | { type: 'symbol'; value: string }
    | { type: 'nag'; value: string }
    | { type: 'comment'; value: string }
    | { type: 'result'; value: GameResult }
  );

/** Tokenizer error: position and German message (without the "Zeile x" prefix). */
export interface PgnTokenizeError extends PgnPosition {
  messageDe: string;
}

/** Result of `tokenizePgn`. */
export type PgnTokenizeResult = { ok: true; tokens: PgnToken[] } | { ok: false; error: PgnTokenizeError };

/** Normalises line breaks and byte order marks (see the file header). */
export function normalizePgnText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/gm, '');
}

const SYMBOL_START = /[A-Za-z0-9]/;
const SYMBOL_CHAR = /[A-Za-z0-9_+#=:\-/]/;
const RESULTS: Record<string, GameResult> = { '1-0': '1-0', '0-1': '0-1', '1/2-1/2': '1/2-1/2', '½-½': '1/2-1/2', '*': '*' };

/** Splits PGN text into tokens (see the file header). Never throws. */
export function tokenizePgn(input: string): PgnTokenizeResult {
  const text = normalizePgnText(input);
  const tokens: PgnToken[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const pos = (): PgnPosition => ({ line, column: i - lineStart + 1 });
  const fail = (at: PgnPosition, messageDe: string): PgnTokenizeResult => ({ ok: false, error: { ...at, messageDe } });

  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\n') {
      i += 1;
      line += 1;
      lineStart = i;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\f' || ch === '\v' || ch === '\u00A0') {
      i += 1;
      continue;
    }
    // Escape line: '%' in the first column.
    if (ch === '%' && i === lineStart) {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    const at = pos();
    if (ch === '[') {
      tokens.push({ type: 'tagOpen', ...at });
      i += 1;
    } else if (ch === ']') {
      tokens.push({ type: 'tagClose', ...at });
      i += 1;
    } else if (ch === '(') {
      tokens.push({ type: 'varOpen', ...at });
      i += 1;
    } else if (ch === ')') {
      tokens.push({ type: 'varClose', ...at });
      i += 1;
    } else if (ch === '.') {
      tokens.push({ type: 'period', ...at });
      i += 1;
    } else if (ch === '*') {
      tokens.push({ type: 'result', value: '*', ...at });
      i += 1;
    } else if (ch === '"') {
      let value = '';
      i += 1;
      let closed = false;
      while (i < text.length && text[i] !== '\n') {
        const c = text[i]!;
        if (c === '\\' && (text[i + 1] === '"' || text[i + 1] === '\\')) {
          value += text[i + 1];
          i += 2;
        } else if (c === '"') {
          closed = true;
          i += 1;
          break;
        } else {
          value += c;
          i += 1;
        }
      }
      if (!closed) return fail(at, PGN_DE.unterminatedString);
      tokens.push({ type: 'string', value, ...at });
    } else if (ch === '{') {
      const end = text.indexOf('}', i + 1);
      if (end < 0) return fail(at, PGN_DE.unterminatedComment);
      const value = text.slice(i + 1, end);
      for (let k = i; k < end; k += 1) {
        if (text[k] === '\n') {
          line += 1;
          lineStart = k + 1;
        }
      }
      tokens.push({ type: 'comment', value: value.trim(), ...at });
      i = end + 1;
    } else if (ch === ';') {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? text.length : end;
      tokens.push({ type: 'comment', value: text.slice(i + 1, stop).trim(), ...at });
      i = stop;
    } else if (ch === '$') {
      let j = i + 1;
      while (j < text.length && /[0-9]/.test(text[j]!)) j += 1;
      if (j === i + 1) return fail(at, PGN_DE.unexpectedChar(ch));
      tokens.push({ type: 'nag', value: text.slice(i, j), ...at });
      i = j;
    } else if (ch === '!' || ch === '?') {
      let j = i;
      while (j < text.length && (text[j] === '!' || text[j] === '?')) j += 1;
      tokens.push({ type: 'nag', value: text.slice(i, j), ...at });
      i = j;
    } else if (ch === '½' && text.startsWith('½-½', i)) {
      tokens.push({ type: 'result', value: '1/2-1/2', ...at });
      i += 3;
    } else if (SYMBOL_START.test(ch)) {
      let j = i + 1;
      while (j < text.length && SYMBOL_CHAR.test(text[j]!)) j += 1;
      const value = text.slice(i, j);
      i = j;
      // "exd6 e.p." – the en-passant suffix is not part of SAN.
      if (value === 'e' && text.startsWith('.p.', i)) {
        i += 3;
        continue;
      }
      const result = RESULTS[value];
      tokens.push(result ? { type: 'result', value: result, ...at } : { type: 'symbol', value, ...at });
    } else if (ch === '-' && text[i + 1] === '-') {
      // Null move "--" (not supported, reported by the parser with the move number).
      tokens.push({ type: 'symbol', value: '--', ...at });
      i += 2;
    } else {
      return fail(at, PGN_DE.unexpectedChar(ch));
    }
  }
  return { ok: true, tokens };
}

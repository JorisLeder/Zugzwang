/**
 * Opening book (PRD "Analyse-Pipeline" step 1, D-07 "book"): positions of the Lichess chess-openings data set
 * (CC0-1.0, built by `npm run openings:build`, see `SOURCES.md`). The JSON (~1 MB) is loaded lazily with a dynamic
 * `import()` on first use, so it stays out of the main bundle and works in Node and the browser alike.
 */
import type { Fen } from '@/core/chess';
import { normalizeFen, positionKey } from '@/lib/chess';

/** Opening name of a book position (`eco` code, English Lichess name). */
export interface OpeningInfo {
  eco: string;
  name: string;
}

/** Loaded opening book. */
export interface OpeningBook {
  /** Number of book positions. */
  readonly size: number;
  /** Source commit of the data set. */
  readonly commit: string;
  /** Opening of a position, `null` when the position is not in the book. */
  get(fen: Fen): OpeningInfo | null;
  /** Whether the position is in the book. */
  has(fen: Fen): boolean;
}

interface OpeningBookJson {
  commit: string;
  entries: string[][];
}

/** Book key of a FEN: the first four fields with castling and e.p. cleaned (e.p. only when a capture is legal). */
export function openingKey(fen: Fen): string | null {
  try {
    return positionKey(normalizeFen(fen));
  } catch {
    return null;
  }
}

/** Builds an `OpeningBook` from the JSON entries `[epd, eco, name]`. */
export function createOpeningBook(data: OpeningBookJson): OpeningBook {
  const map = new Map<string, OpeningInfo>();
  for (const [epd, eco, name] of data.entries) {
    if (epd && eco && name) map.set(epd, { eco, name });
  }
  return {
    size: map.size,
    commit: data.commit,
    get(fen) {
      const key = openingKey(fen);
      return key ? (map.get(key) ?? null) : null;
    },
    has(fen) {
      const key = openingKey(fen);
      return key !== null && map.has(key);
    },
  };
}

let bookPromise: Promise<OpeningBook> | null = null;

/** Loads the opening book once (dynamic import of `openings/openings.json`). */
export function loadOpeningBook(): Promise<OpeningBook> {
  if (!bookPromise) {
    bookPromise = import('./openings/openings.json')
      .then((mod) => createOpeningBook((mod as { default: OpeningBookJson }).default))
      .catch((e: unknown) => {
        bookPromise = null;
        throw e;
      });
  }
  return bookPromise;
}

/** Opening of a position from the Lichess data set, `null` if it is not a book position. */
export async function lookupOpening(fen: Fen): Promise<OpeningInfo | null> {
  return (await loadOpeningBook()).get(fen);
}

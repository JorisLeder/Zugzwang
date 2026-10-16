/**
 * UCI output parser and score normalisation to White's point of view (D-08: the single conversion point).
 */
import type { Color, Uci } from '@/core/chess';
import type { EngineLine, Score } from '@/core/engine';

/** Score as printed by the engine: from the side to move's point of view. */
export type RawScore = { type: 'cp' | 'mate'; value: number };

/** Parsed `info` line. */
export interface UciInfo {
  type: 'info';
  depth?: number;
  seldepth?: number;
  multipv?: number;
  /** Side-to-move point of view (as printed). */
  score?: RawScore;
  bound?: 'lower' | 'upper';
  nodes?: number;
  nps?: number;
  timeMs?: number;
  hashfull?: number;
  currmove?: Uci;
  pv?: Uci[];
  /** `info string …` text. */
  string?: string;
}

/** A parsed UCI output line. */
export type UciMessage =
  | { type: 'id'; name?: string; author?: string }
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'option'; name: string; optionType: string; default?: string; min?: number; max?: number }
  | UciInfo
  | { type: 'bestmove'; move: Uci | null; ponder?: Uci }
  | { type: 'unknown'; line: string };

const INT_FIELDS: Record<string, keyof UciInfo> = {
  depth: 'depth',
  seldepth: 'seldepth',
  multipv: 'multipv',
  nodes: 'nodes',
  nps: 'nps',
  time: 'timeMs',
  hashfull: 'hashfull',
};

function parseInfo(tokens: string[]): UciInfo {
  const info: UciInfo = { type: 'info' };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === 'string') {
      info.string = tokens.slice(i + 1).join(' ');
      break;
    }
    if (t === 'pv') {
      info.pv = tokens.slice(i + 1);
      break;
    }
    if (t === 'score') {
      const kind = tokens[i + 1];
      const value = Number(tokens[i + 2]);
      if ((kind === 'cp' || kind === 'mate') && Number.isFinite(value)) info.score = { type: kind, value };
      i += 2;
      const next = tokens[i + 1];
      if (next === 'lowerbound' || next === 'upperbound') {
        info.bound = next === 'lowerbound' ? 'lower' : 'upper';
        i += 1;
      }
      continue;
    }
    if (t === 'currmove') {
      info.currmove = tokens[i + 1];
      i += 1;
      continue;
    }
    const field = INT_FIELDS[t];
    if (field) {
      const n = Number(tokens[i + 1]);
      if (Number.isFinite(n)) (info as unknown as Record<string, number>)[field] = n;
      i += 1;
    }
  }
  return info;
}

function parseOption(line: string): UciMessage {
  const m = /^option name (.+?) type (\S+)(.*)$/.exec(line);
  if (!m) return { type: 'unknown', line };
  const rest = m[3] ?? '';
  const def = /\bdefault (\S*)/.exec(rest)?.[1];
  const min = /\bmin (-?\d+)/.exec(rest)?.[1];
  const max = /\bmax (-?\d+)/.exec(rest)?.[1];
  const msg: UciMessage = { type: 'option', name: m[1]!, optionType: m[2]! };
  if (def !== undefined) msg.default = def;
  if (min !== undefined) msg.min = Number(min);
  if (max !== undefined) msg.max = Number(max);
  return msg;
}

/** Parses one line of engine output. Unknown lines are returned as `{ type: 'unknown' }`. */
export function parseUciLine(raw: string): UciMessage {
  const line = raw.trim();
  const tokens = line.split(/\s+/);
  switch (tokens[0]) {
    case 'uciok':
      return { type: 'uciok' };
    case 'readyok':
      return { type: 'readyok' };
    case 'id':
      if (tokens[1] === 'name') return { type: 'id', name: tokens.slice(2).join(' ') };
      if (tokens[1] === 'author') return { type: 'id', author: tokens.slice(2).join(' ') };
      return { type: 'unknown', line };
    case 'option':
      return parseOption(line);
    case 'info':
      return parseInfo(tokens);
    case 'bestmove': {
      const move = tokens[1];
      const msg: UciMessage = { type: 'bestmove', move: !move || move === '(none)' || move === '0000' ? null : move };
      if (tokens[2] === 'ponder' && tokens[3]) msg.ponder = tokens[3];
      return msg;
    }
    default:
      return { type: 'unknown', line };
  }
}

/** Converts a side-to-move score to White's point of view (negated when Black is to move). */
export function toWhitePov(score: RawScore, turn: Color): Score {
  if (turn === 'w') return { type: score.type, value: score.value };
  return { type: score.type, value: score.value === 0 ? 0 : -score.value };
}

/**
 * Builds an `EngineLine` (White POV) from an `info` message; `null` unless it has depth, score and a PV.
 * Bounds are flipped together with the score when Black is to move.
 */
export function infoToEngineLine(info: UciInfo, turn: Color): EngineLine | null {
  if (info.depth === undefined || !info.score || !info.pv || info.pv.length === 0) return null;
  const line: EngineLine = {
    multipv: info.multipv ?? 1,
    depth: info.depth,
    score: toWhitePov(info.score, turn),
    pv: info.pv,
  };
  if (info.seldepth !== undefined) line.seldepth = info.seldepth;
  if (info.bound) line.bound = turn === 'w' ? info.bound : info.bound === 'lower' ? 'upper' : 'lower';
  if (info.nodes !== undefined) line.nodes = info.nodes;
  if (info.nps !== undefined) line.nps = info.nps;
  if (info.timeMs !== undefined) line.timeMs = info.timeMs;
  return line;
}

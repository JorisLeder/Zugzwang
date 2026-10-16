/**
 * Puzzle checks used by `scripts/validate/puzzles.ts` (BACKLOG WP-03 "Validator", D-12, D-24, CONSTRAINTS §1/§3).
 *
 * Structure (no engine): zod schema, legal FEN (`validateFen`), all moves legal in sequence, an even number of moves
 * (the line ends with a solver move), no game end before the last move, rating 100–3000, theme ids known, explanation
 * present unless the source is `lichess`, explanation moves taken from the line (or other immediate mates), mate
 * themes consistent with the line.
 *
 * Engine (Stockfish, depth ≥ 18, MultiPV 2) at every solver ply: the solution move is
 * (a) an immediate checkmate, or
 * (b) in a forced-mate position the fastest mate, and no other move mates in the same number of moves, or
 * (c) otherwise the engine's best move with a margin ≥ 0.10 expected points over the second-best move.
 * `mateInN` themes must match the engine's mate distance at the first solver ply (mateIn5 = 5 or more).
 */
import { scoreWinPercent } from '@/analysis';
import type { Color, Fen, MoveRecord } from '@/core/chess';
import type { EngineLine, EngineService } from '@/core/engine';
import type { ExplanationText } from '@/core/explain';
import { puzzleThemeById, type Puzzle } from '@/core/puzzles';
import { puzzleSchema } from '@/core/schemas';
import { ChessGame, fenTurn, formatSan, validateFen } from '@/lib/chess';

/** Bump when the checks change (part of the validation cache key). */
export const PUZZLE_CHECKS_VERSION = 'puzzles-v1';

/** Engine search depth for uniqueness checks (≥ 18, BACKLOG). */
export const PUZZLE_ENGINE_DEPTH = 18;

/** Minimum expected-points margin of the solution over the second-best move (D-12). */
export const UNIQUE_MARGIN_EP = 0.1;

/** Puzzle ratings accepted by the validator. */
export const PUZZLE_RATING_RANGE = { min: 100, max: 3000 } as const;

/** One finding. */
export interface PuzzleIssue {
  id?: string;
  message: string;
}

/** Findings of one puzzle. */
export interface PuzzleCheckResult {
  errors: PuzzleIssue[];
  warnings: PuzzleIssue[];
}

const MATE_THEME = /^mateIn([1-5])$/;

/** Counts sentences of German text (".", "!" or "?" followed by a space or the end). */
export function countSentences(text: string): number {
  return (text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean).length;
}

/** Renders explanation segments as plain text in German notation (how `plain` must look). */
export function renderPlainDe(expl: Pick<ExplanationText, 'segments'>): string {
  return expl.segments.map((s) => (s.type === 'text' ? s.text : formatSan(s.san, 'de'))).join('').trim();
}

/** Replays the line; returns the records or the index of the first illegal move. */
export function replayLine(fen: Fen, moves: readonly string[]): { records: MoveRecord[]; illegalAt: number | null; error?: string } {
  let game: ChessGame;
  try {
    game = ChessGame.fromFen(fen);
  } catch (e) {
    return { records: [], illegalAt: 0, error: e instanceof Error ? e.message : String(e) };
  }
  const records: MoveRecord[] = [];
  for (let i = 0; i < moves.length; i++) {
    const r = game.move(moves[i]!);
    if (!r) return { records, illegalAt: i };
    records.push(r);
  }
  return { records, illegalAt: null };
}

/** SAN of every legal move in `fen` that mates immediately. */
export function matingMoves(fen: Fen): string[] {
  const game = ChessGame.fromFen(fen);
  const out: string[] = [];
  for (const m of game.legalMoves()) {
    const g = ChessGame.fromFen(fen);
    const r = g.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
    if (r?.isCheckmate) out.push(r.san);
  }
  return out;
}

/** Structural checks (no engine). `isFixture` relaxes nothing; it only labels messages. */
export function checkPuzzleStructure(raw: unknown): PuzzleCheckResult & { puzzle: Puzzle | null } {
  const errors: PuzzleIssue[] = [];
  const warnings: PuzzleIssue[] = [];
  const parsed = puzzleSchema.safeParse(raw);
  const rawId = typeof raw === 'object' && raw !== null && 'id' in raw ? String((raw as { id: unknown }).id) : undefined;
  if (!parsed.success) {
    errors.push({ id: rawId, message: `Schema: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` });
    return { errors, warnings, puzzle: null };
  }
  const p = parsed.data;
  const id = p.id;
  const v = validateFen(p.fen);
  if (!v.ok) {
    errors.push({ id, message: `Ungültige FEN: ${v.errorDe}` });
    return { errors, warnings, puzzle: p };
  }
  if (p.moves.length % 2 !== 0) errors.push({ id, message: `Die Zugfolge muss mit einem Zug des Lösenden enden (gerade Anzahl Züge, hat ${p.moves.length}).` });
  const { records, illegalAt, error } = replayLine(p.fen, p.moves);
  if (illegalAt !== null) {
    errors.push({ id, message: error ?? `Zug ${illegalAt + 1} („${p.moves[illegalAt]}“) ist nicht legal.` });
    return { errors, warnings, puzzle: p };
  }
  const solver: Color = fenTurn(p.fen) === 'w' ? 'b' : 'w';
  if (records[1] && records[1].color !== solver) errors.push({ id, message: 'Nach moves[0] ist nicht der Lösende am Zug.' });
  // No game end before the last move.
  for (let i = 0; i < records.length - 1; i++) {
    const g = ChessGame.fromMoves(p.fen, p.moves.slice(0, i + 1));
    if (g.status().isOver) {
      errors.push({ id, message: `Die Partie ist nach Zug ${i + 1} schon beendet (${g.status().reason}).` });
      break;
    }
  }
  if (p.rating < PUZZLE_RATING_RANGE.min || p.rating > PUZZLE_RATING_RANGE.max) {
    errors.push({ id, message: `Rating ${p.rating} liegt außerhalb von ${PUZZLE_RATING_RANGE.min}–${PUZZLE_RATING_RANGE.max}.` });
  }
  for (const t of p.themes) if (!puzzleThemeById(t)) errors.push({ id, message: `Unbekanntes Thema „${t}“.` });
  if (p.themes.length === 0) warnings.push({ id, message: 'Puzzle hat keine Themen.' });
  // Mate themes vs. the line.
  const last = records[records.length - 1];
  const userMoves = Math.floor(p.moves.length / 2);
  const mateThemes = p.themes.map((t) => MATE_THEME.exec(t)).filter((m): m is RegExpExecArray => m !== null);
  const endsInMate = last?.isCheckmate ?? false;
  if ((mateThemes.length > 0 || p.themes.includes('mate')) && !endsInMate) {
    errors.push({ id, message: 'Matt-Thema, aber der letzte Zug setzt nicht matt.' });
  }
  if (endsInMate && !p.themes.includes('mate') && mateThemes.length === 0) {
    warnings.push({ id, message: 'Die Lösung endet mit Matt, aber das Puzzle hat kein Matt-Thema.' });
  }
  if (mateThemes.length > 1) errors.push({ id, message: 'Mehr als ein mateInN-Thema.' });
  for (const m of mateThemes) {
    const n = Number(m[1]);
    if (n < 5 ? userMoves !== n : userMoves < 5) errors.push({ id, message: `Thema ${m[0]}, aber die Lösung hat ${userMoves} Züge.` });
  }
  // Explanation.
  if (!p.explanation) {
    if (p.source !== 'lichess') errors.push({ id, message: 'Erklärung fehlt (nur Lichess-Puzzles dürfen ohne Erklärung sein).' });
  } else {
    const allowed = new Set(records.slice(1).map((r) => r.san));
    for (let i = 1; i < records.length; i += 2) for (const san of matingMoves(records[i]!.fenBefore)) allowed.add(san);
    for (const s of p.explanation.segments) {
      if (s.type === 'move' && !allowed.has(s.san)) {
        errors.push({ id, message: `Die Erklärung nennt den Zug „${s.san}“, der nicht zur Lösung gehört.` });
      }
    }
    const sentences = countSentences(p.explanation.plain);
    if (sentences < 1 || sentences > 3) errors.push({ id, message: `Die Erklärung hat ${sentences} Sätze (erlaubt: 1–3).` });
    if (renderPlainDe(p.explanation) !== p.explanation.plain.trim()) {
      warnings.push({ id, message: '`plain` passt nicht zu den Segmenten (deutsche Notation).' });
    }
  }
  return { errors, warnings, puzzle: p };
}

/** Solver's mate distance from a White-POV score (positive = solver mates in n), `null` if not a mate for the solver. */
export function solverMateIn(line: EngineLine | undefined, solver: Color): number | null {
  if (!line || line.score.type !== 'mate') return null;
  const n = solver === 'w' ? line.score.value : -line.score.value;
  return n > 0 ? n : null;
}

/** Expected points (0–1) of an engine line for `solver` in a position with side to move `turn`. */
export function solverExpectedPoints(line: EngineLine, solver: Color, turn: Color): number {
  return scoreWinPercent(line.score, solver, turn) / 100;
}

/** Engine checks at every solver ply (see file header). Positions must be legal (run the structure checks first). */
export async function checkPuzzleWithEngine(
  puzzle: Puzzle,
  engine: EngineService,
  opts: { depth?: number } = {},
): Promise<PuzzleCheckResult> {
  const errors: PuzzleIssue[] = [];
  const warnings: PuzzleIssue[] = [];
  const id = puzzle.id;
  const depth = opts.depth ?? PUZZLE_ENGINE_DEPTH;
  const { records } = replayLine(puzzle.fen, puzzle.moves);
  const solver: Color = fenTurn(puzzle.fen) === 'w' ? 'b' : 'w';
  const mateTheme = puzzle.themes.map((t) => MATE_THEME.exec(t)).find((m) => m !== null);
  for (let ply = 1; ply < records.length; ply += 2) {
    const rec = records[ply]!;
    const moveNo = (ply + 1) / 2;
    if (rec.isCheckmate) {
      // (a) immediate mate – other mating moves are accepted at runtime (D-12).
      if (ply === 1 && mateTheme && Number(mateTheme[1]) !== 1) {
        errors.push({ id, message: `Thema ${mateTheme[0]}, aber der erste Zug setzt sofort matt.` });
      }
      continue;
    }
    const analysis = await engine.analyse(rec.fenBefore, { depth, multiPv: 2 });
    const [l1, l2] = analysis.lines;
    if (!l1) {
      errors.push({ id, message: `Zug ${moveNo}: Die Engine findet keinen Zug.` });
      continue;
    }
    const mate1 = solverMateIn(l1, solver);
    if (ply === 1 && mateTheme) {
      const n = Number(mateTheme[1]);
      const ok = mate1 !== null && (n < 5 ? mate1 === n : mate1 >= 5);
      if (!ok) errors.push({ id, message: `Thema ${mateTheme[0]}, aber die Engine sieht ${mate1 ? `Matt in ${mate1}` : 'kein Matt'}.` });
    }
    if (mate1 !== null) {
      // (b) forced mate: fastest mate, no equally fast alternative.
      const mate2 = solverMateIn(l2, solver);
      if (l1.pv[0] === rec.uci) {
        if (l2 && mate2 === mate1) {
          errors.push({ id, message: `Zug ${moveNo} (${rec.san}): ${l2.pv[0]} setzt ebenfalls in ${mate1} Zügen matt.` });
        }
      } else if (l2 && l2.pv[0] === rec.uci && mate2 === mate1) {
        errors.push({ id, message: `Zug ${moveNo} (${rec.san}): ${l1.pv[0]} setzt ebenfalls in ${mate1} Zügen matt.` });
      } else {
        errors.push({ id, message: `Zug ${moveNo} (${rec.san}) ist nicht das schnellste Matt (Engine: ${l1.pv[0]}, Matt in ${mate1}).` });
      }
      continue;
    }
    // (c) unique best move by ≥ 0.10 expected points.
    if (l1.pv[0] !== rec.uci) {
      errors.push({ id, message: `Zug ${moveNo} (${rec.san}) ist nicht der beste Zug (Engine: ${l1.pv[0]}).` });
      continue;
    }
    if (!l2) {
      warnings.push({ id, message: `Zug ${moveNo} (${rec.san}) ist der einzige legale Zug.` });
      continue;
    }
    const turn = fenTurn(rec.fenBefore);
    const margin = solverExpectedPoints(l1, solver, turn) - solverExpectedPoints(l2, solver, turn);
    if (margin < UNIQUE_MARGIN_EP) {
      errors.push({
        id,
        message: `Zug ${moveNo} (${rec.san}) ist nicht eindeutig: ${l2.pv[0]} ist nur ${margin.toFixed(3)} erwartete Punkte schlechter (mindestens ${UNIQUE_MARGIN_EP}).`,
      });
    }
  }
  return { errors, warnings };
}

/**
 * Content validator for the bot roster (WP-04, BACKLOG "repertoire … validated by scripts/validate/bots.ts").
 *
 * Checks (structure, always): ≥ 10 bots between 100 and 2500 Elo with ≥ 4 below 800 (P0-07), unique kebab-case ids,
 * sorted by Elo, engine per strength band (D-16), German texts and all six chat categories, avatar SVG files (own
 * files, no scripts or external references), 2–4 repertoire lines per colour, every line legal English SAN from the
 * start position exactly as chess.js writes it, the bot moves at least once, no duplicates, no finished game.
 * Engine check (skipped with `--quick`): the position at the end of every line is playable for the bot – its evaluation
 * from the bot's point of view is ≥ −1.5 pawns (error) and ≥ −0.8 pawns (otherwise a warning); bots below 800 Elo play
 * dubious beginner openings on purpose and get −2.5 / −1.5 pawns (`repertoireLimits`).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BOT_ROSTER, COACH_AVATAR } from '@/bots';
import type { BotProfile } from '@/core/bots';
import type { Color, San } from '@/core/chess';
import { START_FEN } from '@/core/chess';
import { ChessGame } from '@/lib/chess';
import type { ValidationContext, ValidationIssue, ValidationReport } from '../lib/validation';

/** Bump when the checks change (cache key of the engine results). */
export const VALIDATOR_VERSION = 'bots-1';

/** Engine thresholds of the repertoire check (centipawns, bot's point of view). */
export const REPERTOIRE_LIMITS = { errorBelowCp: -150, warnBelowCp: -80, depth: 14 } as const;

/**
 * Thresholds for a bot: the weak bots (< 800) play dubious beginner openings on purpose (early queen, Englund
 * gambit, Blackburne trap) – for them only lines that lose more than 2.5 pawns are errors (1.5 pawns: warning).
 */
export function repertoireLimits(elo: number): { errorBelowCp: number; warnBelowCp: number } {
  return elo < 800 ? { errorBelowCp: -250, warnBelowCp: -150 } : { errorBelowCp: REPERTOIRE_LIMITS.errorBelowCp, warnBelowCp: REPERTOIRE_LIMITS.warnBelowCp };
}

const CHAT_KEYS: Array<keyof BotProfile['chat']> = ['greeting', 'onCapture', 'onCheck', 'onWin', 'onLoss', 'onDraw'];

/** Expected engine of a bot by Elo (D-16). */
export function expectedEngines(elo: number): Array<BotProfile['engine']> {
  if (elo < 800) return ['stockfish-skill'];
  if (elo <= 2000) return ['stockfish-human', 'maia'];
  return ['stockfish-elo'];
}

/** A repertoire line replayed from the start position. */
export interface ReplayedLine {
  bot: string;
  elo: number;
  color: Color;
  line: San[];
  /** Final position (when legal). */
  fen?: string;
}

/** Checks one repertoire line; returns the issues and the final FEN when legal. */
export function checkLine(bot: BotProfile, color: Color, line: San[]): { issues: string[]; fen?: string } {
  const issues: string[] = [];
  if (line.length === 0) return { issues: ['Leere Eröffnungslinie.'] };
  const game = ChessGame.fromFen(START_FEN);
  for (const [i, san] of line.entries()) {
    const rec = game.move(san);
    if (!rec) return { issues: [`Zug ${i + 1} „${san}“ ist nicht legal.`] };
    if (rec.san !== san) issues.push(`Zug ${i + 1} „${san}“ muss als „${rec.san}“ (englische SAN) geschrieben werden.`);
  }
  const botMoves = line.filter((_, i) => (i % 2 === 0 ? 'w' : 'b') === color).length;
  if (botMoves === 0) issues.push(`Die Linie enthält keinen Zug von ${color === 'w' ? 'Weiß' : 'Schwarz'}.`);
  if (game.status().isOver) issues.push('Die Linie endet mit dem Ende der Partie.');
  return { issues, fen: game.fen() };
}

/** Checks an avatar file (path relative to `public/`). */
export function checkAvatar(rootDir: string, publicPath: string): string[] {
  if (!publicPath.startsWith('/avatars/bots/') || !publicPath.endsWith('.svg')) return [`Avatar-Pfad „${publicPath}“ muss /avatars/bots/<id>.svg sein.`];
  const file = join(rootDir, 'public', publicPath);
  if (!existsSync(file)) return [`Avatar-Datei fehlt: public${publicPath}`];
  const svg = readFileSync(file, 'utf8');
  const issues: string[] = [];
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(svg)) issues.push('Avatar ist kein SVG.');
  if (!/viewBox="/.test(svg)) issues.push('Avatar-SVG braucht ein viewBox-Attribut.');
  if (/<script/i.test(svg) || /\son[a-z]+=/i.test(svg)) issues.push('Avatar-SVG darf keine Skripte enthalten.');
  if (/(href|src)="(https?:)?\/\//i.test(svg)) issues.push('Avatar-SVG darf keine externen Dateien laden.');
  if (statSync(file).size > 20_000) issues.push('Avatar-SVG ist größer als 20 kB.');
  return issues;
}

/** Structure checks of a roster (no engine). Returns issues plus every legal line for the engine check. */
export function validateRoster(roster: readonly BotProfile[], rootDir: string): { errors: ValidationIssue[]; warnings: ValidationIssue[]; lines: ReplayedLine[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const lines: ReplayedLine[] = [];
  const file = 'src/bots/roster.ts';

  if (roster.length < 10) errors.push({ file, message: `Mindestens 10 Bots nötig (P0-07), gefunden: ${roster.length}.` });
  const below800 = roster.filter((b) => b.elo < 800).length;
  if (below800 < 4) errors.push({ file, message: `Mindestens 4 Bots unter 800 Elo nötig (P0-07), gefunden: ${below800}.` });
  const ids = new Set<string>();
  roster.forEach((bot, i) => {
    const err = (message: string) => errors.push({ file, id: bot.id, message });
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(bot.id)) err('Die id muss kebab-case sein.');
    if (ids.has(bot.id)) err('Doppelte id.');
    ids.add(bot.id);
    if (i > 0 && roster[i - 1]!.elo > bot.elo) err('Die Bots müssen nach Elo sortiert sein.');
    if (!Number.isFinite(bot.elo) || bot.elo < 100 || bot.elo > 2500) err(`Elo ${bot.elo} liegt nicht zwischen 100 und 2500.`);
    if (!expectedEngines(bot.elo).includes(bot.engine)) err(`Engine „${bot.engine}“ passt nicht zu ${bot.elo} Elo (D-16: ${expectedEngines(bot.elo).join(' oder ')}).`);
    if (!bot.name.trim()) err('Name fehlt.');
    if (!bot.styleLabelDe.trim()) err('Stil-Bezeichnung fehlt.');
    if (!bot.descriptionDe.trim()) err('Beschreibung fehlt.');
    const sentences = bot.descriptionDe.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    if (sentences > 2) warnings.push({ file, id: bot.id, message: 'Die Beschreibung soll höchstens zwei Sätze haben.' });
    for (const key of CHAT_KEYS) {
      const chat = bot.chat[key];
      if (!chat || chat.length === 0 || chat.some((l) => !l.trim())) err(`Chat-Sprüche „${key}“ fehlen oder sind leer.`);
    }
    for (const issue of checkAvatar(rootDir, bot.avatar)) err(issue);
    for (const color of ['w', 'b'] as const) {
      const list = color === 'w' ? bot.repertoire.white : bot.repertoire.black;
      const label = color === 'w' ? 'Weiß' : 'Schwarz';
      if (list.length < 2 || list.length > 4) err(`Repertoire ${label}: 2–4 Linien nötig, gefunden: ${list.length}.`);
      const seen = new Set<string>();
      for (const line of list) {
        const key = line.join(' ');
        if (seen.has(key)) err(`Repertoire ${label}: doppelte Linie „${key}“.`);
        seen.add(key);
        const r = checkLine(bot, color, line);
        for (const issue of r.issues) err(`Repertoire ${label} „${key}“: ${issue}`);
        if (r.issues.length === 0 && r.fen) lines.push({ bot: bot.id, elo: bot.elo, color, line, fen: r.fen });
      }
    }
  });
  for (const issue of checkAvatar(rootDir, COACH_AVATAR)) errors.push({ file: `public${COACH_AVATAR}`, message: issue });
  return { errors, warnings, lines };
}

/** Centipawns from the bot's point of view for a White-POV score (mate = ±10 000). */
function botCp(score: { type: 'cp' | 'mate'; value: number }, color: Color): number {
  const white = score.type === 'cp' ? score.value : score.value > 0 ? 10_000 : -10_000;
  return color === 'w' ? white : -white;
}

/** Validator entry (default export). */
export default async function validateBots(ctx: ValidationContext): Promise<ValidationReport> {
  const { errors, warnings, lines } = validateRoster(BOT_ROSTER, ctx.rootDir);
  if (!ctx.quick) {
    const engine = await ctx.engine();
    for (const l of lines) {
      const key = ctx.cache.key(`${l.bot}|${l.color}|${l.line.join(' ')}|${REPERTOIRE_LIMITS.depth}`, VALIDATOR_VERSION);
      const score = await ctx.cache.getOrCompute(key, async () => {
        const a = await engine.analyse(l.fen!, { depth: REPERTOIRE_LIMITS.depth });
        return a.lines[0]?.score ?? { type: 'cp' as const, value: 0 };
      });
      const cp = botCp(score, l.color);
      const where = { file: 'src/bots/roster.ts', id: l.bot };
      const text = `Repertoire ${l.color === 'w' ? 'Weiß' : 'Schwarz'} „${l.line.join(' ')}“: Bewertung aus Sicht des Bots ${(cp / 100).toFixed(2)}`;
      const limits = repertoireLimits(l.elo);
      if (cp < limits.errorBelowCp) errors.push({ ...where, message: `${text} – die Linie verliert zu viel.` });
      else if (cp < limits.warnBelowCp) warnings.push({ ...where, message: `${text} – fragwürdige Linie.` });
    }
  }
  return { name: 'bots', checked: BOT_ROSTER.length + lines.length, errors, warnings };
}

/**
 * Rule-based German explanations (PRD P0-11, D-19, DESIGN §8.3) – deterministic templates driven only by the
 * engine-confirmed `ExplanationFacts` (WP-02 `buildFacts`): every move in the text is the played move, a move of
 * `bestLine` or a move of `refutation`; squares and pieces come from the detected motifs or from replaying those lines
 * with the rules layer. 1–3 sentences, why before what, no engine numbers.
 *
 * Voice per kind:
 * - `mistake` (game review): third person with side names ("Nach Sxe5 kann Weiß mit Dh5+ …"), because the mover may
 *   be the learner or the opponent; sentence 1 = consequence (never names the better move – it is the teaser shown
 *   before "Nochmal versuchen", DESIGN §8.4), sentence 2 = the better move, sentence 3 = a "Merke" rule.
 * - `coach_warning`, `threat`, `praise`, `puzzle`: "du" (the learner is the mover); a coach warning does not reveal the
 *   better move (the learner is asked to think again, DESIGN §5.3).
 */
import type { Color, MoveRecord, San } from '@/core/chess';
import type { ExplanationFacts, ExplanationText, MotifId, MotifInstance } from '@/core/explain';
import { PIECE_VALUES } from '@/lib/chess';
import { capitalize, listDe, pieceNp, piecePronoun, promotionPhrase, sideName, type Determiner } from './grammar';
import { bestLineOf, replayFactLines, type FactLines } from './lines';
import { assemble, ln, mv, sentence, type Sentence } from './segments';
import { MERKE_DE, NO_FACTS_DE, PUZZLE_THEME_DE, PUZZLE_THEME_ORDER, THEME_MOTIF } from './strings.de';

type Voice = 'third' | 'du';
type MotifKey = MotifId | 'generic';

interface Ctx {
  facts: ExplanationFacts;
  mover: Color;
  opp: Color;
  lines: FactLines;
  voice: Voice;
  /** Refutation SAN of the legal prefix (as in the facts). */
  ref: San[];
}

interface Picked {
  sentence: Sentence;
  motif: MotifKey;
  /** Sentence 1 already names the piece the better move captures. */
  namesBestCapture?: boolean;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const zuegen = (n: number) => (n === 1 ? 'einem Zug' : `${n} Zügen`);
const MAX_INLINE_LINE = 5;

/** King first, then the more valuable piece ("den König und die Dame auf d1"). */
function byImportance(a: { piece: MotifInstance['pieces'][number]['piece'] }, b: { piece: MotifInstance['pieces'][number]['piece'] }): number {
  if (a.piece === 'k' || b.piece === 'k') return a.piece === 'k' ? -1 : b.piece === 'k' ? 1 : 0;
  return PIECE_VALUES[b.piece] - PIECE_VALUES[a.piece];
}

function find(facts: ExplanationFacts, id: MotifId, pred: (m: MotifInstance) => boolean = () => true): MotifInstance | undefined {
  return facts.motifs.find((m) => m.id === id && pred(m));
}

/** Index of the first move of `records` by `color` that captures on `square` (−1 if none). */
function captureIndex(records: readonly MoveRecord[], square: string, color: Color): number {
  return records.findIndex((r) => r.color === color && r.captured !== undefined && !r.isEnPassant && r.to === square);
}

function context(facts: ExplanationFacts, voice: Voice): Ctx {
  const lines = replayFactLines(facts);
  return { facts, mover: facts.mover, opp: other(facts.mover), lines, voice, ref: facts.refutation.slice(0, lines.refutation.length) };
}

const subjectOpp = (ctx: Ctx) => (ctx.voice === 'du' ? 'dein Gegner' : sideName(ctx.opp));
const ownDet = (ctx: Ctx): Determiner => (ctx.voice === 'du' ? 'poss' : 'def');

// -------------------------------------------------------------------------------------------- mistake / coach warning

/** Sentence 1 from the motifs that punish the played move (refutation of the opponent). */
function victimSentence(ctx: Ctx): Picked | null {
  const { facts, lines, ref } = ctx;
  const P = facts.playedMove?.san;
  const r0 = ref[0];
  const R = lines.refutation;
  if (!P || !r0 || !R[0]) return null;
  const O = subjectOpp(ctx);
  const det = ownDet(ctx);

  if (facts.mateIn !== undefined && facts.mateIn < 0) {
    const n = -facts.mateIn;
    const mateIdx = ref.findIndex((s) => s.endsWith('#'));
    if (n === 1 && mateIdx === 0) return { sentence: sentence('Nach ', mv(P), ` kann ${O} mit `, mv(r0), ' sofort mattsetzen.'), motif: 'mate' };
    if (mateIdx > 0 && mateIdx < MAX_INLINE_LINE) {
      return { sentence: sentence('Nach ', mv(P), ` kann ${O} in ${zuegen(n)} mattsetzen: `, ln(ref.slice(0, mateIdx + 1)), '.'), motif: 'mate' };
    }
    return { sentence: sentence('Nach ', mv(P), ` kann ${O} in ${zuegen(n)} mattsetzen, beginnend mit `, mv(r0), '.'), motif: 'mate' };
  }

  const promoIdx = R.findIndex((r) => r.color === ctx.opp && r.promotion !== undefined);
  if (find(facts, 'promotion') && promoIdx >= 0 && promoIdx < MAX_INLINE_LINE) {
    const promo = R[promoIdx]!.promotion!;
    return {
      sentence: sentence('Nach ', mv(P), ` kann ${O} mit `, ln(ref.slice(0, promoIdx + 1)), ` einen Bauern ${promotionPhrase(promo)} umwandeln.`),
      motif: 'promotion',
    };
  }

  const fork = find(facts, 'fork', (m) => m.squares[0] === R[0]!.to);
  const forkTargets = (fork?.pieces.slice(1).filter((p) => p.color === ctx.mover) ?? []).sort(byImportance);
  if (fork && forkTargets.length >= 2) {
    const targets = forkTargets.map((p) => pieceNp(p, 'acc', det));
    return { sentence: sentence('Nach ', mv(P), ` kann ${O} mit `, mv(r0), ` gleichzeitig ${listDe(targets)} angreifen – eine Gabel.`), motif: 'fork' };
  }

  if (find(facts, 'double_check') && R[0].isCheck) {
    return { sentence: sentence('Nach ', mv(P), ` kann ${O} mit `, mv(r0), ' Doppelschach geben.'), motif: 'double_check' };
  }

  const disc = find(facts, 'discovered_attack', (m) => m.squares[2] === R[0]!.from && m.pieces.length >= 2);
  if (disc) {
    const [d, t] = disc.pieces as [MotifInstance['pieces'][number], MotifInstance['pieces'][number]];
    return {
      sentence: sentence('Nach ', mv(P), ` kann ${O} mit `, mv(r0), ` eine Linie öffnen: ${capitalize(pieceNp(d, 'nom', 'def'))} greift dann ${pieceNp(t, 'acc', det)} an.`),
      motif: 'discovered_attack',
    };
  }

  const pin = find(facts, 'pin', (m) => m.pieces.length >= 3);
  if (pin) {
    const [, front, behind] = pin.pieces as [unknown, MotifInstance['pieces'][number], MotifInstance['pieces'][number]];
    return {
      sentence: sentence('Nach ', mv(P), ` kann ${O} mit `, mv(r0), ` ${pieceNp(front, 'acc', det)} an ${pieceNp(behind, 'acc', det)} fesseln.`),
      motif: 'pin',
    };
  }

  const skewer = find(facts, 'skewer', (m) => m.pieces.length >= 3);
  if (skewer) {
    const [, front, behind] = skewer.pieces as [unknown, MotifInstance['pieces'][number], MotifInstance['pieces'][number]];
    return {
      sentence: sentence('Nach ', mv(P), ` kann ${O} mit `, mv(r0), ` ${pieceNp(front, 'acc', det)} angreifen – dahinter steht ${pieceNp(behind, 'nom', det)}.`),
      motif: 'skewer',
    };
  }

  for (const id of ['hanging_piece', 'trapped_piece'] as const) {
    for (const m of facts.motifs.filter((x) => x.id === id)) {
      const p = m.pieces[0];
      if (!p || p.color !== ctx.mover) continue;
      const k = captureIndex(R, p.square, ctx.opp);
      if (k < 0) continue;
      const pron = piecePronoun(p.piece, 'acc');
      const head = id === 'hanging_piece' ? `hängt ${pieceNp(p, 'nom', det)}` : `ist ${pieceNp(p, 'nom', det)} gefangen`;
      const tail =
        k === 0
          ? sentence(`${capitalize(O)} kann ${pron} mit `, mv(r0), ' schlagen.')
          : sentence(`${capitalize(O)} kann ${pron} mit `, ln(ref.slice(0, k + 1)), ' gewinnen.');
      return { sentence: [...sentence('Nach ', mv(P), ` ${head}: `), ...tail], motif: id };
    }
  }

  const loss = find(facts, 'material_loss');
  if (loss) {
    const lost = [...loss.pieces].filter((p) => p.color === ctx.mover).sort((a, b) => PIECE_VALUES[b.piece] - PIECE_VALUES[a.piece])[0];
    const k = lost && PIECE_VALUES[lost.piece] >= 3 ? captureIndex(R, lost.square, ctx.opp) : -1;
    const verb = ctx.voice === 'du' ? 'verlierst du' : `verliert ${sideName(ctx.mover)}`;
    if (lost && k >= 0) {
      const pron = piecePronoun(lost.piece, 'acc');
      const tail =
        k === 0 ? sentence(`${capitalize(O)} kann ${pron} mit `, mv(r0), ' schlagen.') : sentence('Es folgt ', ln(ref.slice(0, k + 1)), '.');
      return { sentence: [...sentence('Nach ', mv(P), ` ${verb} ${pieceNp(lost, 'acc', det)}: `), ...tail], motif: 'material_loss' };
    }
    let last = -1;
    R.forEach((r, i) => {
      if (r.color === ctx.opp && r.captured) last = i;
    });
    if (last >= 0) {
      return { sentence: sentence('Nach ', mv(P), ` ${verb} Material: Es folgt `, ln(ref.slice(0, last + 1)), '.'), motif: 'material_loss' };
    }
  }

  if (find(facts, 'mate_threat')) {
    return { sentence: sentence('Nach ', mv(P), ` kann ${O} mit `, mv(r0), ' Matt drohen.'), motif: 'mate_threat' };
  }
  return null;
}

/** Sentence 1 when the played move missed a win (never names the better move – it is the teaser). */
function missedSentence(ctx: Ctx): Picked | null {
  const { facts, lines } = ctx;
  const mateIn = facts.mateIn !== undefined && facts.mateIn > 0 ? facts.mateIn : undefined;
  const missed = find(facts, 'missed_win');
  if (!missed && mateIn === undefined) return null;
  const who = ctx.voice === 'du' ? 'Hier kannst du' : `Hier konnte ${sideName(ctx.mover)}`;
  if (mateIn !== undefined) {
    return { sentence: sentence(`${who} ${mateIn === 1 ? 'sofort' : `in ${zuegen(mateIn)}`} mattsetzen.`), motif: 'missed_win' };
  }
  const best = lines.best[0];
  if (best?.captured && !best.isEnPassant) {
    return {
      sentence: sentence(`${who} ${pieceNp({ piece: best.captured, square: best.to }, 'acc', 'def')} schlagen.`),
      motif: 'missed_win',
      namesBestCapture: true,
    };
  }
  return { sentence: sentence(`${who} Material gewinnen.`), motif: 'missed_win' };
}

function genericSentence(ctx: Ctx): Picked {
  const P = ctx.facts.playedMove?.san;
  const r0 = ctx.ref[0];
  if (P && r0) return { sentence: sentence('Nach ', mv(P), ` hat ${subjectOpp(ctx)} mit `, mv(r0), ' eine starke Antwort.'), motif: 'generic' };
  if (P) {
    const whose = ctx.voice === 'du' ? 'deine Stellung' : `die Stellung von ${sideName(ctx.mover)}`;
    return { sentence: sentence(mv(P), ` verschlechtert ${whose} deutlich.`), motif: 'generic' };
  }
  return { sentence: sentence(ctx.voice === 'du' ? 'Hier gibt es einen stärkeren Zug.' : 'Hier gab es einen stärkeren Zug.'), motif: 'generic' };
}

/** Sentence 2 of a mistake: the better move (only engine-confirmed facts). */
function betterSentence(ctx: Ctx, first: Picked): Sentence | null {
  const { facts, lines } = ctx;
  const B = bestLineOf(facts)[0];
  if (!B || !lines.best[0] || B === facts.playedMove?.san) return null;
  const M = sideName(ctx.mover);
  if (B.endsWith('#')) return sentence('Besser war ', mv(B), ' – das ist sofort Matt.');
  if (facts.mateIn !== undefined && facts.mateIn > 1) return sentence('Besser war ', mv(B), `: Damit hätte ${M} ein Matt in ${zuegen(facts.mateIn)} erzwungen.`);
  const best = lines.best[0];
  if (best.captured && !best.isEnPassant && !first.namesBestCapture) {
    return sentence('Besser war ', mv(B), `: Damit hätte ${M} ${pieceNp({ piece: best.captured, square: best.to }, 'acc', 'def')} geschlagen.`);
  }
  return sentence('Besser war ', mv(B), '.');
}

function mistakeSentences(facts: ExplanationFacts): { sentences: Sentence[]; motifs: MotifId[] } {
  const ctx = context(facts, 'third');
  const first = victimSentence(ctx) ?? missedSentence(ctx) ?? genericSentence(ctx);
  const better = betterSentence(ctx, first);
  const merke = MERKE_DE[first.motif] ?? MERKE_DE.generic!;
  const sentences = [first.sentence, ...(better ? [better] : []), sentence(merke)];
  return { sentences, motifs: first.motif === 'generic' ? [] : [first.motif] };
}

function coachWarningSentences(facts: ExplanationFacts): { sentences: Sentence[]; motifs: MotifId[] } {
  const ctx = context(facts, 'du');
  const first = victimSentence(ctx) ?? missedSentence(ctx) ?? genericSentence(ctx);
  return { sentences: [first.sentence], motifs: first.motif === 'generic' ? [] : [first.motif] };
}

// ------------------------------------------------------------------------------------------------------------ threat

function threatSentences(facts: ExplanationFacts): { sentences: Sentence[]; motifs: MotifId[] } {
  const ctx = context(facts, 'du');
  const { lines, ref } = ctx;
  const R = lines.refutation;
  const r0 = ref[0];
  const B = bestLineOf(facts)[0];
  const defence = B && lines.best[0] ? [sentence('Eine gute Antwort ist ', mv(B), '.')] : [];
  if (!r0 || !R[0]) return { sentences: [sentence('Achtung: Dein Gegner hat eine Drohung.'), ...defence], motifs: [] };
  const pick = (s: Sentence, motif: MotifKey) => ({ sentences: [s, ...defence], motifs: motif === 'generic' ? [] : [motif] });

  if (facts.mateIn !== undefined && facts.mateIn < 0) {
    const n = -facts.mateIn;
    if (n === 1 && r0.endsWith('#')) return pick(sentence('Achtung: Dein Gegner droht mit ', mv(r0), ' Matt.'), 'mate_threat');
    return pick(sentence(`Achtung: Dein Gegner droht ein Matt in ${zuegen(n)}, beginnend mit `, mv(r0), '.'), 'mate_threat');
  }
  const promoIdx = R.findIndex((r) => r.color === ctx.opp && r.promotion !== undefined);
  if (find(facts, 'promotion') && promoIdx >= 0 && promoIdx < MAX_INLINE_LINE) {
    return pick(
      sentence('Achtung: Dein Gegner droht, mit ', ln(ref.slice(0, promoIdx + 1)), ` einen Bauern ${promotionPhrase(R[promoIdx]!.promotion!)} umzuwandeln.`),
      'promotion',
    );
  }
  const fork = find(facts, 'fork', (m) => m.squares[0] === R[0]!.to);
  const forkTargets = (fork?.pieces.slice(1).filter((p) => p.color === ctx.mover) ?? []).sort(byImportance);
  if (fork && forkTargets.length >= 2) {
    return pick(sentence('Achtung: Dein Gegner droht mit ', mv(r0), ` eine Gabel gegen ${listDe(forkTargets.map((p) => pieceNp(p, 'acc', 'poss')))}.`), 'fork');
  }
  if (find(facts, 'double_check') && R[0].isCheck) return pick(sentence('Achtung: Dein Gegner droht mit ', mv(r0), ' ein Doppelschach.'), 'double_check');
  const disc = find(facts, 'discovered_attack', (m) => m.squares[2] === R[0]!.from && m.pieces.length >= 2);
  if (disc) {
    return pick(sentence('Achtung: Dein Gegner droht mit ', mv(r0), ` einen Abzugsangriff auf ${pieceNp(disc.pieces[1]!, 'acc', 'poss')}.`), 'discovered_attack');
  }
  const pin = find(facts, 'pin', (m) => m.pieces.length >= 3);
  if (pin) {
    return pick(
      sentence('Achtung: Dein Gegner droht, mit ', mv(r0), ` ${pieceNp(pin.pieces[1]!, 'acc', 'poss')} an ${pieceNp(pin.pieces[2]!, 'acc', 'poss')} zu fesseln.`),
      'pin',
    );
  }
  const skewer = find(facts, 'skewer', (m) => m.pieces.length >= 3);
  if (skewer) {
    return pick(
      sentence('Achtung: Dein Gegner droht mit ', mv(r0), ` einen Spieß gegen ${pieceNp(skewer.pieces[1]!, 'acc', 'poss')} und ${pieceNp(skewer.pieces[2]!, 'acc', 'poss')}.`),
      'skewer',
    );
  }
  for (const id of ['hanging_piece', 'trapped_piece'] as const) {
    for (const m of facts.motifs.filter((x) => x.id === id)) {
      const p = m.pieces[0];
      if (!p || p.color !== ctx.mover) continue;
      const k = captureIndex(R, p.square, ctx.opp);
      if (k < 0) continue;
      if (id === 'trapped_piece') {
        return pick(
          sentence(`Achtung: ${capitalize(pieceNp(p, 'nom', 'poss'))} ist gefangen – dein Gegner droht, ${piecePronoun(p.piece, 'acc')} mit `, ln(ref.slice(0, k + 1)), ' zu gewinnen.'),
          id,
        );
      }
      return pick(
        k === 0
          ? sentence(`Achtung: Dein Gegner droht, ${pieceNp(p, 'acc', 'poss')} mit `, mv(r0), ' zu schlagen.')
          : sentence(`Achtung: Dein Gegner droht, ${pieceNp(p, 'acc', 'poss')} mit `, ln(ref.slice(0, k + 1)), ' zu gewinnen.'),
        id,
      );
    }
  }
  if (find(facts, 'material_loss')) return pick(sentence('Achtung: Dein Gegner droht, mit ', mv(r0), ' Material zu gewinnen.'), 'material_loss');
  return pick(sentence('Achtung: Dein Gegner droht ', mv(r0), '.'), 'generic');
}

// ------------------------------------------------------------------------------------------------------------ praise

/** "Mit {move} …" sentence for a motif the mover's move creates (praise, puzzles). */
function achievementSentence(facts: ExplanationFacts, move: MoveRecord, san: San): { sentence: Sentence; motif: MotifId } | null {
  const own = (m: MotifInstance) => m.pieces.filter((p) => p.color !== facts.mover).sort(byImportance);
  if (move.isCheckmate) return { sentence: sentence(mv(san), ' setzt matt.'), motif: 'mate' };
  if (find(facts, 'double_check', (m) => m.squares.includes(move.to))) {
    return { sentence: sentence('Mit ', mv(san), ' gibst du Doppelschach – der König muss ziehen.'), motif: 'double_check' };
  }
  const fork = find(facts, 'fork', (m) => m.squares[0] === move.to);
  if (fork && own(fork).length >= 2) {
    return { sentence: sentence('Mit ', mv(san), ` greifst du gleichzeitig ${listDe(own(fork).map((p) => pieceNp(p, 'acc', 'def')))} an – eine Gabel.`), motif: 'fork' };
  }
  const disc = find(facts, 'discovered_attack', (m) => m.squares[2] === move.from && m.pieces.length >= 2);
  if (disc) {
    return {
      sentence: sentence('Mit ', mv(san), ` öffnest du eine Linie: ${capitalize(pieceNp(disc.pieces[0]!, 'nom', 'poss'))} greift jetzt ${pieceNp(disc.pieces[1]!, 'acc', 'def')} an.`),
      motif: 'discovered_attack',
    };
  }
  const pin = find(facts, 'pin', (m) => m.pieces.length >= 3 && m.pieces[0]!.color === facts.mover);
  if (pin) {
    return { sentence: sentence('Mit ', mv(san), ` fesselst du ${pieceNp(pin.pieces[1]!, 'acc', 'def')} an ${pieceNp(pin.pieces[2]!, 'acc', 'def')}.`), motif: 'pin' };
  }
  const skewer = find(facts, 'skewer', (m) => m.pieces.length >= 3 && m.pieces[0]!.color === facts.mover);
  if (skewer) {
    return {
      sentence: sentence('Mit ', mv(san), ` greifst du ${pieceNp(skewer.pieces[1]!, 'acc', 'def')} an – dahinter steht ${pieceNp(skewer.pieces[2]!, 'nom', 'def')}.`),
      motif: 'skewer',
    };
  }
  if (move.promotion) return { sentence: sentence('Mit ', mv(san), ` wandelst du deinen Bauern ${promotionPhrase(move.promotion)} um.`), motif: 'promotion' };
  const hanging = find(facts, 'hanging_piece', (m) => m.squares[0] === move.to && m.pieces[0]?.color !== facts.mover);
  if (hanging && move.captured) return { sentence: sentence('Mit ', mv(san), ` gewinnst du ${pieceNp(hanging.pieces[0]!, 'acc', 'def')}.`), motif: 'hanging_piece' };
  const trapped = find(facts, 'trapped_piece', (m) => m.pieces[0] !== undefined && m.pieces[0].color !== facts.mover);
  if (trapped) return { sentence: sentence('Nach ', mv(san), ` hat ${pieceNp(trapped.pieces[0]!, 'nom', 'def')} kein sicheres Feld mehr.`), motif: 'trapped_piece' };
  if (find(facts, 'mate_threat', (m) => m.pieces[0]?.color === facts.mover || m.squares[0] === move.from)) {
    return { sentence: sentence('Mit ', mv(san), ' drohst du Matt.'), motif: 'mate_threat' };
  }
  return null;
}

function praiseSentences(facts: ExplanationFacts): { sentences: Sentence[]; motifs: MotifId[] } {
  const lines = replayFactLines(facts);
  const P = facts.playedMove?.san;
  if (!P || !lines.played) return fallback(facts);
  const first = achievementSentence(facts, lines.played, P);
  const sentences = [first?.sentence ?? sentence(mv(P), ' ist hier genau der richtige Zug.')];
  if (facts.mateIn !== undefined && facts.mateIn > 1 && !lines.played.isCheckmate) {
    sentences.push(sentence(`Damit kannst du in ${zuegen(facts.mateIn)} mattsetzen.`));
  }
  return { sentences, motifs: first ? [first.motif] : [] };
}

// ------------------------------------------------------------------------------------------------------------ puzzle

function puzzleSentences(facts: ExplanationFacts): { sentences: Sentence[]; motifs: MotifId[] } {
  const line = bestLineOf(facts);
  const lines = replayFactLines(facts);
  const legal = line.slice(0, lines.best.length);
  const B = legal[0];
  const first = lines.best[0];
  if (!B || !first) return fallback(facts);
  const themes = facts.themes ?? [];
  const motifs: MotifId[] = themes.map((t) => THEME_MOTIF[t]).filter((m): m is MotifId => m !== undefined);
  const theme = PUZZLE_THEME_ORDER.find((t) => themes.includes(t));
  const themeSentence = theme ? sentence(PUZZLE_THEME_DE[theme]!) : null;
  const mateIdx = legal.findIndex((s) => s.endsWith('#'));
  const mateIn = facts.mateIn !== undefined && facts.mateIn > 0 ? facts.mateIn : mateIdx >= 0 ? Math.floor(mateIdx / 2) + 1 : undefined;

  if (mateIn !== undefined && mateIdx >= 0) {
    if (mateIdx === 0) return { sentences: [sentence(mv(B), ' setzt sofort matt.'), ...(themeSentence ? [themeSentence] : [])], motifs: [...motifs, 'mate'] };
    const out = [sentence('Mit ', mv(B), ` erzwingst du ein Matt in ${zuegen(mateIn)}.`)];
    if (themeSentence) out.push(themeSentence);
    if (mateIdx < 7) out.push(sentence('Die ganze Lösung: ', ln(legal.slice(0, mateIdx + 1)), '.'));
    return { sentences: out.slice(0, 3), motifs: [...motifs, 'mate'] };
  }

  const achievement = achievementSentence(facts, first, B);
  const lead = achievement?.sentence ?? themeSentence;
  const key =
    legal.length > 1
      ? sentence('Der Schlüsselzug ist ', mv(B), ', danach folgt ', ln(legal.slice(1, 4)), '.')
      : sentence('Der Schlüsselzug ist ', mv(B), '.');
  const sentences = lead ? (achievement ? [lead] : [lead, key]) : [key];
  if (achievement && legal.length > 1) sentences.push(sentence('Danach folgt ', ln(legal.slice(1, 4)), '.'));
  return { sentences, motifs: achievement ? [...motifs, achievement.motif] : motifs };
}

// ------------------------------------------------------------------------------------------------------------ public

function fallback(facts: ExplanationFacts): { sentences: Sentence[]; motifs: MotifId[] } {
  const B = bestLineOf(facts)[0];
  if (B && replayFactLines(facts).best[0]) return { sentences: [sentence('Der stärkste Zug hier ist ', mv(B), '.')], motifs: [] };
  return { sentences: [sentence(NO_FACTS_DE)], motifs: [] };
}

/** The sentences of the rule-based explanation (each sentence as segments). */
export function explanationSentences(facts: ExplanationFacts): { sentences: Sentence[]; motifs: MotifId[] } {
  switch (facts.kind) {
    case 'mistake':
      return mistakeSentences(facts);
    case 'coach_warning':
      return coachWarningSentences(facts);
    case 'threat':
      return threatSentences(facts);
    case 'praise':
      return praiseSentences(facts);
    case 'puzzle':
      return puzzleSentences(facts);
    default:
      return fallback(facts);
  }
}

/** Deterministic German template explanation (1–3 sentences, "du", only engine-confirmed moves). Never throws. */
export function explainRuleBased(facts: ExplanationFacts): ExplanationText {
  try {
    const { sentences, motifs } = explanationSentences(facts);
    return assemble(sentences.slice(0, 3), 'rule', motifs);
  } catch (e) {
    console.warn('Rule-based explanation failed', e);
    return assemble([sentence(NO_FACTS_DE)], 'rule', []);
  }
}

/**
 * First sentence of the rule-based explanation. For `mistake` it states the consequence of the played move and never
 * names the better move – shown before "Nochmal versuchen" / "Besseren Zug zeigen" (DESIGN §8.4, §9.2).
 */
export function explanationTeaser(facts: ExplanationFacts): ExplanationText {
  try {
    const { sentences, motifs } = explanationSentences(facts);
    return assemble(sentences.slice(0, 1), 'rule', motifs);
  } catch {
    return assemble([sentence(NO_FACTS_DE)], 'rule', []);
  }
}

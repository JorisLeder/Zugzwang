import { describe, expect, it } from 'vitest';
import type { ExplanationFacts, ExplanationSegment } from '@/core/explain';
import { countSentences } from './segments';
import { factMoves, splitMarkers, validateExplanationSegments } from './validate';

/** 14. Qc2?? of the fixture game: best Rxf2 f5, refutation Bxa2 a5 (engine facts). */
const FACTS: ExplanationFacts = {
  kind: 'mistake',
  mover: 'w',
  fenBefore: 'r4rk1/1ppq1pp1/pbnpb2p/4p3/PP2P3/N1PP1N1P/B4nP1/R1BQ1RK1 w - - 0 14',
  playedMove: { uci: 'd1c2', san: 'Qc2' },
  bestMove: { uci: 'f1f2', san: 'Rxf2' },
  bestLine: ['Rxf2', 'f5'],
  refutation: ['Bxa2', 'a5'],
  expectedPointsLoss: 0.424,
  motifs: [],
};

const t = (text: string): ExplanationSegment => ({ type: 'text', text });
const m = (san: string): ExplanationSegment => ({ type: 'move', san });

describe('factMoves', () => {
  it('lists the played move, the best line and the refutation with their positions', () => {
    expect(factMoves(FACTS).map((x) => x.san)).toEqual(['Qc2', 'Rxf2', 'f5', 'Bxa2', 'a5']);
  });

  it('starts a threat line from the null-move position', () => {
    const threat: ExplanationFacts = {
      kind: 'threat',
      mover: 'b',
      fenBefore: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
      bestLine: ['g6'],
      refutation: ['Qxf7#'],
      motifs: [],
    };
    expect(factMoves(threat).map((x) => x.san)).toEqual(['g6', 'Qxf7#']);
  });
});

describe('validateExplanationSegments (LLM validator, P0-11)', () => {
  it('accepts moves of the facts and canonicalises German or sloppy SAN', () => {
    const r = validateExplanationSegments(
      [t('Nach '), m('Dc2'), t(' schlägt Schwarz mit '), m('Lxa2'), t(' den Läufer. Besser war '), m('Txf2'), t(', danach '), m('f5'), t('.')],
      FACTS,
    );
    expect(r).toEqual({
      ok: true,
      segments: [t('Nach '), m('Qc2'), t(' schlägt Schwarz mit '), m('Bxa2'), t(' den Läufer. Besser war '), m('Rxf2'), t(', danach '), m('f5'), t('.')],
    });
  });

  it('accepts [[SAN]] markers inside text', () => {
    const r = validateExplanationSegments([t('Besser war [[Rxf2]], weil der Springer auf f2 hängt.')], FACTS);
    expect(r).toEqual({ ok: true, segments: [t('Besser war '), m('Rxf2'), t(', weil der Springer auf f2 hängt.')] });
  });

  it('rejects a legal move that is not in the facts', () => {
    // Rxf2 is in the facts, Qd2 is legal in the position but no engine line contains it.
    expect(validateExplanationSegments([t('Besser war '), m('Qd2'), t('.')], FACTS)).toEqual({ ok: false, reason: 'move_not_in_facts' });
  });

  it('rejects an illegal move', () => {
    expect(validateExplanationSegments([t('Besser war '), m('Qxh7#'), t('.')], FACTS)).toEqual({ ok: false, reason: 'move_not_in_facts' });
    expect(validateExplanationSegments([t('Besser war '), m('Zz9'), t('.')], FACTS)).toEqual({ ok: false, reason: 'move_not_in_facts' });
  });

  it('accepts a line move only at its place in the line (legal in sequence)', () => {
    // f5 is Black's reply after Rxf2: it is confirmed at that place of the best line.
    expect(validateExplanationSegments([t('Nach '), m('Rxf2'), t(' folgt '), m('f5'), t('.')], FACTS)).toMatchObject({ ok: true });
    // A line is replayed with the rules layer and cut at its first illegal move: later moves are not confirmed.
    const broken: ExplanationFacts = { ...FACTS, bestLine: ['Rxf2', 'Ke7', 'Nxe5'], refutation: [] };
    expect(factMoves(broken).map((x) => x.san)).toEqual(['Qc2', 'Rxf2']);
    expect(validateExplanationSegments([t('Danach '), m('Nxe5'), t('.')], broken)).toEqual({ ok: false, reason: 'move_not_in_facts' });
    // A move that is legal in none of the fact positions is rejected.
    expect(validateExplanationSegments([t('Spiel '), m('a6'), t('.')], FACTS)).toEqual({ ok: false, reason: 'move_not_in_facts' });
  });

  it('rejects unmarked moves and leftover markers in the text', () => {
    expect(validateExplanationSegments([t('Besser war Txf2.')], FACTS)).toEqual({ ok: false, reason: 'unmarked_move' });
    expect(validateExplanationSegments([t('Nach dxe5 ist alles anders.')], FACTS)).toEqual({ ok: false, reason: 'unmarked_move' });
    expect(validateExplanationSegments([t('Mach 0-0.')], FACTS)).toEqual({ ok: false, reason: 'unmarked_move' });
    expect(validateExplanationSegments([t('Besser war [[Rxf2.')], FACTS)).toEqual({ ok: false, reason: 'marker' });
    // Promotions, long algebraic moves and figurines are moves too.
    expect(validateExplanationSegments([t('Nach [[Qc2]] war e8=T besser.')], FACTS)).toEqual({ ok: false, reason: 'unmarked_move' });
    expect(validateExplanationSegments([t('Dann kommt e8D+ mit Matt.')], FACTS)).toEqual({ ok: false, reason: 'unmarked_move' });
    expect(validateExplanationSegments([t('Besser war \u2656e8 mit Gewinn.')], FACTS)).toEqual({ ok: false, reason: 'unmarked_move' });
    expect(validateExplanationSegments([t('Besser war ♖e8 mit Gewinn.')], FACTS)).toEqual({ ok: false, reason: 'unmarked_move' });
    expect(validateExplanationSegments([t('Hier hilft e7-e8 nicht.')], FACTS)).toEqual({ ok: false, reason: 'unmarked_move' });
    expect(validateExplanationSegments([t('Hier hilft e2xe4 nicht.')], FACTS)).toEqual({ ok: false, reason: 'unmarked_move' });
    // Squares alone are fine.
    expect(validateExplanationSegments([t('Der Bauer auf e4 steht gut.')], FACTS)).toMatchObject({ ok: true });
    expect(validateExplanationSegments([t('Es gibt in e8 Gruppen und Mitte8 Zeilen.')], FACTS)).toMatchObject({ ok: true });
    expect(validateExplanationSegments([t('Der Läufer auf c4 und der Bauer auf e4 sind gedeckt.')], FACTS)).toMatchObject({ ok: true });
  });

  it('detects move spellings with other captures, dashes, castling, move numbers and pawn checks', () => {
    // Facts: 14. Qc2 (played), best Rxf2 – none of the moves below is part of them.
    const bad = [
      'Besser war D\u00D7e5 mit Gewinn.',
      'Besser war D:e5 mit Gewinn.',
      'Rochade 0\u20130 ist stark.',
      'Rochiere O\u2013O bald.',
      'Rochiere O\u2014O\u2014O bald.',
      'Rochiere 0\u20110\u20110 bald.',
      'Spiele e2\u2013e4 sofort.',
      'Spiele e2\u2014e4 sofort.',
      'Spiele e2\u2011e4 sofort.',
      'Spiele e2:e4 sofort.',
      'Spiele e2\u00D7d3 sofort.',
      'Spiele o-o.',
      'Spiele o-o-o.',
      'Spiele 0-0-0 sofort.',
      'Nach 1.d4 d5 ist es gleich.',
      'Nach 1. d4 d5 ist es gleich.',
      'Nach 12...Sf6 ist es gleich.',
      'Nach 12\u2026Sf6 ist es gleich.',
      'Dann kommt e8+ mit Schach.',
      'Dann kommt d7# mit Matt.',
      'Nach exd5 und e:d5 ist es gleich.',
    ];
    for (const text of bad) expect(validateExplanationSegments([t(text)], FACTS), text).toEqual({ ok: false, reason: 'unmarked_move' });
    // Marked moves that are not in the facts are rejected as moves of the facts.
    expect(validateExplanationSegments([t('Besser war '), m('Qxe5'), t('.')], FACTS)).toEqual({ ok: false, reason: 'move_not_in_facts' });
    expect(validateExplanationSegments([t('Rochade '), m('O-O'), t(' ist stark.')], FACTS)).toEqual({ ok: false, reason: 'move_not_in_facts' });
  });

  it('does not flag ordinary German text, results, times or plain squares', () => {
    const good = [
      'Nach 12 Z\u00FCgen ist die Partie vorbei.',
      'Im 12. Zug verlierst du die Dame.',
      'Die Partie endete 1-0 f\u00FCr Wei\u00DF.',
      'Die Partie endete 1:0 f\u00FCr Wei\u00DF.',
      'Das Ergebnis war 0-1 und danach 1/2-1/2.',
      'Um 10:30 Uhr war Schluss.',
      'Der Bauer auf e4 und der Turm auf d1 stehen gut.',
      'Der Turm geht von a1 nach a8 – das ist eine offene Linie.',
      'Das ist Plan A \u2013 oder Plan B.',
      'So-so, das war nichts.',
      'Am 3. Februar ging es um 5 Punkte.',
    ];
    for (const text of good) expect(validateExplanationSegments([t(text)], FACTS), text).toMatchObject({ ok: true });
  });

  it('rejects empty, too long and more than three sentences', () => {
    expect(validateExplanationSegments([m('Rxf2')], FACTS)).toEqual({ ok: false, reason: 'empty' });
    expect(validateExplanationSegments([t('  ')], FACTS)).toEqual({ ok: false, reason: 'empty' });
    expect(validateExplanationSegments([t('Eins. Zwei. Drei. Vier.')], FACTS)).toEqual({ ok: false, reason: 'too_many_sentences' });
    expect(validateExplanationSegments([t(`${'Sehr lang '.repeat(60)}.`)], FACTS)).toEqual({ ok: false, reason: 'too_long' });
  });
});

describe('helpers', () => {
  it('splitMarkers converts [[SAN]] and keeps move segments', () => {
    expect(splitMarkers([t('A [[e4]] B [[Nf3]]'), m(' d4 ')])).toEqual([t('A '), m('e4'), t(' B '), m('Nf3'), m('d4')]);
  });

  it('countSentences ignores abbreviations', () => {
    expect(countSentences('Eins. Zwei! Drei?')).toBe(3);
    expect(countSentences('Ein Turm, z. B. auf d1, hilft.')).toBe(1);
    expect(countSentences('Ohne Punkt')).toBe(1);
    expect(countSentences('')).toBe(0);
  });

  it('countSentences ignores German ordinals', () => {
    expect(countSentences('Im 12. Zug verlierst du die Dame. Das ist schlecht. Merke dir das.')).toBe(3);
    expect(countSentences('Im 12. Zug verlierst du die Dame.')).toBe(1);
  });
});

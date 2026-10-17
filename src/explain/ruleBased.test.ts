import { describe, expect, it } from 'vitest';
import { buildFacts, type BuildFactsInput } from '@/analysis';
import type { ExplanationFacts } from '@/core/explain';
import { explainRuleBased, explanationTeaser } from './ruleBased';
import { countSentences } from './segments';
import { factMoves, validateExplanationSegments } from './validate';

const facts = (kind: ExplanationFacts['kind'], input: BuildFactsInput) => buildFacts(kind, input);

/**
 * Facts as WP-02's pipeline produced them with Stockfish 19 (game review of real games, captured once): the three
 * blunders of "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxe5+ Nxe5" and of the 40-move fixture game (14. Qc2??).
 */
const REAL: Record<string, ExplanationFacts> = {
  nf6: facts('mistake', {
    fenBefore: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
    playedMove: 'g8f6',
    bestLine: ['g7g6', 'h5f3', 'g8f6', 'g1e2', 'c6a5', 'd2d3', 'f8g7', 'c1g5'],
    bestScore: { type: 'cp', value: 30 },
    refutation: ['h5f7'],
    refutationScore: { type: 'mate', value: 1 },
    expectedPointsLoss: 0.505,
  }),
  qxe5: facts('mistake', {
    fenBefore: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    playedMove: 'h5e5',
    bestLine: ['h5f7'],
    bestScore: { type: 'mate', value: 1 },
    refutation: ['c6e5', 'd2d3', 'd7d5', 'c4b3', 'f8b4', 'c1d2', 'e8g8', 'g1f3'],
    refutationScore: { type: 'cp', value: -900 },
    expectedPointsLoss: 0.934,
  }),
  qc2: facts('mistake', {
    fenBefore: 'r4rk1/1ppq1pp1/pbnpb2p/4p3/PP2P3/N1PP1N1P/B4nP1/R1BQ1RK1 w - - 0 14',
    playedMove: 'd1c2',
    bestLine: ['f1f2', 'f7f5'],
    bestScore: { type: 'cp', value: 81 },
    refutation: ['e6a2', 'a4a5'],
    refutationScore: { type: 'cp', value: -471 },
    expectedPointsLoss: 0.424,
  }),
};

/** Hand-built positions, one per template branch; engine lines chosen by hand (only legality matters here). */
const CASES: Record<string, ExplanationFacts> = {
  fork: facts('mistake', {
    fenBefore: '4k3/8/8/2b5/6n1/8/P4P2/3QK2R w K - 0 1',
    playedMove: 'a2a3',
    bestLine: ['e1g1'],
    bestScore: { type: 'cp', value: -50 },
    refutation: ['g4f2', 'd1e2', 'f2h1'],
    refutationScore: { type: 'cp', value: -600 },
  }),
  pin: facts('mistake', {
    fenBefore: 'rnbqk1nr/pppp1ppp/8/2b1p3/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 1',
    playedMove: 'd2d4',
    bestLine: ['g1f3'],
    bestScore: { type: 'cp', value: 0 },
    refutation: ['c5b4'],
    refutationScore: { type: 'cp', value: -100 },
  }),
  skewer: facts('mistake', {
    fenBefore: '8/8/6k1/8/7Q/2K5/8/r7 w - - 0 1',
    playedMove: 'c3c4',
    bestLine: ['h4g4'],
    bestScore: { type: 'cp', value: 900 },
    refutation: ['a1a4', 'c4d5', 'a4h4'],
    refutationScore: { type: 'cp', value: -100 },
  }),
  hanging: facts('mistake', {
    fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    playedMove: 'd8h4',
    bestLine: ['b8c6'],
    bestScore: { type: 'cp', value: -40 },
    refutation: ['f3h4'],
    refutationScore: { type: 'cp', value: 900 },
  }),
  mateIn2: facts('mistake', {
    fenBefore: '4r1k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1',
    playedMove: 'e8e2',
    bestLine: ['h7h6'],
    bestScore: { type: 'cp', value: 0 },
    refutation: ['d1d8', 'e2e8', 'd8e8'],
    refutationScore: { type: 'mate', value: 2 },
  }),
  missedCapture: facts('mistake', {
    fenBefore: 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    playedMove: 'd2d3',
    bestLine: ['f3h4'],
    bestScore: { type: 'cp', value: 900 },
    refutation: ['h4f6'],
    refutationScore: { type: 'cp', value: 0 },
  }),
  promotion: facts('mistake', {
    fenBefore: '8/8/8/8/8/1k6/p7/3K4 w - - 0 1',
    playedMove: 'd1e2',
    bestLine: ['d1c1'],
    bestScore: { type: 'cp', value: -100 },
    refutation: ['a2a1q'],
    refutationScore: { type: 'cp', value: -900 },
  }),
  discovered: facts('mistake', {
    fenBefore: '4k3/4r3/8/4n3/8/8/3Q4/4K3 w - - 0 1',
    playedMove: 'd2d4',
    bestLine: ['d2e2'],
    bestScore: { type: 'cp', value: -100 },
    refutation: ['e5f3'],
    refutationScore: { type: 'cp', value: -900 },
  }),
  generic: {
    kind: 'mistake',
    mover: 'w',
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playedMove: { uci: 'g2g4', san: 'g4' },
    bestMove: { uci: 'e2e4', san: 'e4' },
    bestLine: ['e4', 'e5'],
    refutation: ['d5'],
    motifs: [],
  },
  coachHanging: facts('coach_warning', {
    fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    playedMove: 'd8h4',
    bestLine: ['b8c6'],
    bestScore: { type: 'cp', value: -40 },
    refutation: ['f3h4'],
    refutationScore: { type: 'cp', value: 900 },
  }),
  coachFork: facts('coach_warning', {
    fenBefore: '4k3/8/8/2b5/6n1/8/P4P2/3QK2R w K - 0 1',
    playedMove: 'a2a3',
    bestLine: ['e1g1'],
    bestScore: { type: 'cp', value: -50 },
    refutation: ['g4f2', 'd1e2', 'f2h1'],
    refutationScore: { type: 'cp', value: -600 },
  }),
  threatMate: facts('threat', {
    fenBefore: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
    bestLine: ['g7g6'],
    bestScore: { type: 'cp', value: 30 },
    refutation: ['h5f7'],
    refutationScore: { type: 'mate', value: 1 },
  }),
  threatHanging: facts('threat', {
    fenBefore: 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3',
    bestLine: ['h4f6'],
    bestScore: { type: 'cp', value: 0 },
    refutation: ['f3h4'],
    refutationScore: { type: 'cp', value: 900 },
  }),
  praiseFork: facts('praise', {
    fenBefore: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
    playedMove: 'd5c7',
    bestLine: ['d5c7', 'e8d7', 'c7a8'],
    bestScore: { type: 'cp', value: 600 },
    refutation: ['e8d7', 'c7a8'],
    refutationScore: { type: 'cp', value: 600 },
  }),
  praiseMate: facts('praise', {
    fenBefore: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    playedMove: 'd1d8',
    bestLine: ['d1d8'],
    bestScore: { type: 'mate', value: 1 },
  }),
  puzzleMate1: {
    kind: 'puzzle',
    mover: 'w',
    fenBefore: '6k1/5ppp/8/8/4n3/8/5PPP/RR4K1 w - - 1 2',
    bestMove: { uci: 'b1b8', san: 'Rb8#' },
    bestLine: ['Rb8#'],
    refutation: [],
    motifs: [],
    mateIn: 1,
    themes: ['mateIn1', 'backRankMate', 'mate'],
  },
  puzzleMate2: {
    kind: 'puzzle',
    mover: 'w',
    fenBefore: '5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1',
    bestMove: { uci: 'c4g8', san: 'Qg8+' },
    bestLine: ['Qg8+', 'Rxg8', 'Nf7#'],
    refutation: [],
    motifs: [],
    mateIn: 2,
    themes: ['mateIn2', 'smotheredMate'],
  },
  puzzleFork: {
    kind: 'puzzle',
    mover: 'w',
    fenBefore: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
    bestMove: { uci: 'd5c7', san: 'Nc7+' },
    bestLine: ['Nc7+', 'Kd7', 'Nxa8'],
    refutation: [],
    motifs: [],
    themes: ['fork', 'short'],
  },
};

const ALL = { ...REAL, ...CASES };

describe('explainRuleBased – real pipeline facts', () => {
  it('explains the mate in one the move allows (third person, why → better move → rule)', () => {
    expect(explainRuleBased(REAL.nf6!).plain).toBe(
      'Nach Sf6 kann Weiß mit Dxf7# sofort mattsetzen. Besser war g6. Merke: Prüfe vor jedem Zug, welche Schachgebote dein Gegner danach hat.',
    );
  });

  it('explains a hanging queen and the missed mate', () => {
    expect(explainRuleBased(REAL.qxe5!).plain).toBe(
      'Nach Dxe5+ hängt die Dame auf e5: Schwarz kann sie mit Sxe5 schlagen. Besser war Dxf7# – das ist sofort Matt. Merke: Prüfe vor jedem Zug, welche deiner Figuren danach ungedeckt sind.',
    );
  });

  it('explains the fixture blunder 14. Qc2?? (lost bishop, better Rxf2)', () => {
    const e = explainRuleBased(REAL.qc2!);
    expect(e.plain).toBe(
      'Nach Dc2 verliert Weiß den Läufer auf a2: Schwarz kann ihn mit Lxa2 schlagen. Besser war Txf2: Damit hätte Weiß den Springer auf f2 geschlagen. Merke: Prüfe vor jedem Zug, welche deiner Figuren danach ungedeckt sind.',
    );
    expect(e.source).toBe('rule');
    expect(e.motifs).toEqual(['material_loss']);
    // Moves are English SAN in the segments; plain uses German letters.
    expect(e.segments.filter((s) => s.type === 'move').map((s) => (s.type === 'move' ? s.san : ''))).toEqual(['Qc2', 'Bxa2', 'Rxf2']);
  });
});

describe('explainRuleBased – templates', () => {
  it.each([
    ['fork', 'Nach a3 kann Schwarz mit Sxf2 gleichzeitig die Dame auf d1 und den Turm auf h1 angreifen – eine Gabel.'],
    ['pin', 'Nach d4 kann Schwarz mit Lb4 den Springer auf c3 an den König fesseln.'],
    ['skewer', 'Nach Kc4 kann Schwarz mit Ta4+ den König angreifen – dahinter steht die Dame auf h4.'],
    ['hanging', 'Nach Dh4 hängt die Dame auf h4: Weiß kann sie mit Sxh4 schlagen.'],
    ['mateIn2', 'Nach Te2 kann Weiß in 2 Zügen mattsetzen: Td8+ Te8 Txe8#.'],
    ['missedCapture', 'Hier konnte Weiß die Dame auf h4 schlagen.'],
    ['promotion', 'Nach Ke2 kann Schwarz mit a1=D einen Bauern in eine Dame umwandeln.'],
    ['discovered', 'Nach Dd4 kann Schwarz mit Sf3+ gleichzeitig den König und die Dame auf d4 angreifen – eine Gabel.'],
    ['generic', 'Nach g4 hat Schwarz mit d5 eine starke Antwort.'],
  ])('mistake %s: sentence 1', (name, first) => {
    expect(explanationTeaser(CASES[name]!).plain).toBe(first);
    expect(explainRuleBased(CASES[name]!).plain.startsWith(first)).toBe(true);
  });

  it('names the better move in sentence 2 and does not repeat a capture already named', () => {
    expect(explainRuleBased(CASES.missedCapture!).plain).toBe(
      'Hier konnte Weiß die Dame auf h4 schlagen. Besser war Sxh4. Merke: Suche in jeder Stellung zuerst nach Schachgeboten, Schlagzügen und Drohungen.',
    );
    expect(explainRuleBased(CASES.fork!).plain).toContain('Besser war 0-0.');
  });

  it('coach warnings speak to the learner and do not reveal the better move', () => {
    expect(explainRuleBased(CASES.coachHanging!).plain).toBe('Nach Dh4 hängt deine Dame auf h4: Dein Gegner kann sie mit Sxh4 schlagen.');
    expect(explainRuleBased(CASES.coachFork!).plain).toBe(
      'Nach a3 kann dein Gegner mit Sxf2 gleichzeitig deine Dame auf d1 und deinen Turm auf h1 angreifen – eine Gabel.',
    );
    for (const name of ['coachHanging', 'coachFork']) {
      const e = explainRuleBased(CASES[name]!);
      const best = CASES[name]!.bestMove!.san;
      expect(e.segments.some((s) => s.type === 'move' && s.san === best)).toBe(false);
    }
  });

  it('threats name the threat and a good defence', () => {
    expect(explainRuleBased(CASES.threatMate!).plain).toBe('Achtung: Dein Gegner droht mit Dxf7# Matt. Eine gute Antwort ist g6.');
    expect(explainRuleBased(CASES.threatHanging!).plain).toBe('Achtung: Dein Gegner droht, deine Dame auf h4 mit Sxh4 zu schlagen. Eine gute Antwort ist Df6.');
  });

  it('praise says what the move achieves', () => {
    expect(explainRuleBased(CASES.praiseFork!).plain).toBe('Mit Sc7+ greifst du gleichzeitig den König und den Turm auf a8 an – eine Gabel.');
    expect(explainRuleBased(CASES.praiseMate!).plain).toBe('Td8# setzt matt.');
  });

  it('puzzles: mate in one, forced mate with the solution, motif themes', () => {
    expect(explainRuleBased(CASES.puzzleMate1!).plain).toBe(
      'Tb8# setzt sofort matt. Der König steht auf der Grundreihe und wird von seinen eigenen Figuren eingesperrt.',
    );
    expect(explainRuleBased(CASES.puzzleMate2!).plain).toBe(
      'Mit Dg8+ erzwingst du ein Matt in 2 Zügen. Der König wird von seinen eigenen Figuren eingesperrt – ein ersticktes Matt. Die ganze Lösung: Dg8+ Txg8 Sf7#.',
    );
    expect(explainRuleBased(CASES.puzzleFork!).plain).toBe(
      'Das Motiv ist eine Gabel: Eine Figur greift zwei gegnerische Figuren gleichzeitig an. Der Schlüsselzug ist Sc7+, danach folgt Kd7 Sxa8.',
    );
    expect(explainRuleBased(CASES.puzzleFork!).motifs).toEqual(['fork']);
  });

  it('falls back safely for empty or broken facts', () => {
    const empty: ExplanationFacts = { kind: 'mistake', mover: 'w', fenBefore: 'invalid', bestLine: [], refutation: [], motifs: [] };
    expect(explainRuleBased(empty).plain).toBe('Hier gab es einen stärkeren Zug. Merke: Prüfe vor jedem Zug die stärkste Antwort deines Gegners.');
    const noMoves: ExplanationFacts = { ...empty, kind: 'puzzle' };
    expect(explainRuleBased(noMoves).plain).toBe('Zu dieser Stellung gibt es keine genaueren Angaben der Engine.');
  });
});

describe('explainRuleBased – invariants for every case (P0-11)', () => {
  it.each(Object.entries(ALL))('%s: 1–3 sentences, only fact moves, no engine numbers', (_name, f) => {
    const e = explainRuleBased(f);
    const n = countSentences(e.plain);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
    // Every move is a move of the facts at a legal place in its line (the same check the LLM output must pass).
    expect(validateExplanationSegments(e.segments, f)).toMatchObject({ ok: true });
    const moves = factMoves(f).map((m) => m.san);
    for (const s of e.segments) if (s.type === 'move') expect(moves).toContain(s.san);
    // No evaluations or percentages in the text (DESIGN §8.3).
    expect(e.plain).not.toMatch(/\d+,\d|%|Centipawn|Bauerneinheit/);
    expect(e.plain).not.toMatch(/\s{2}/);
  });

  it.each(Object.entries(ALL).filter(([, f]) => f.kind === 'mistake'))('%s: the teaser never names the better move', (_name, f) => {
    const teaser = explanationTeaser(f);
    const best = f.bestMove?.san;
    if (!best) return;
    expect(teaser.segments.some((s) => s.type === 'move' && s.san === best && f.playedMove?.san !== best)).toBe(false);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EngineLine } from '@/core/engine';
import type { CourseMeta, Lesson, LessonStep } from '@/core/lessons';
import { FakeEngineService } from '@/core/testing';
import type { ValidationCache, ValidationContext } from '../lib/validation';
import { readLessonContent, validateLessonContent } from '../validate/lessons';
import {
  checkCatalogAndFiles,
  checkCourseRules,
  checkLaunchScope,
  checkLessonStatic,
  checkSources,
  checkStepStatic,
  checkStepWithEngine,
  checkStructure,
  lintTexts,
  materialSignature,
  type LessonContent,
} from './lessonChecks';

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function memoryCache(): ValidationCache {
  const m = new Map<string, unknown>();
  return {
    key: (content, version) => `${version}:${content}`,
    get: <T>(k: string) => m.get(k) as T | undefined,
    set: (k, v) => void m.set(k, v),
    getOrCompute: async <T>(k: string, compute: () => Promise<T>) => {
      if (!m.has(k)) m.set(k, await compute());
      return m.get(k) as T;
    },
  };
}

function ctx(engine: FakeEngineService, quick = false): ValidationContext {
  return { rootDir: '/', quick, engine: async () => engine, engineId: 'fake', cache: memoryCache(), log: silent };
}

/** White-POV line helper. */
const cp = (multipv: number, move: string, value: number): EngineLine => ({ multipv, depth: 18, score: { type: 'cp', value }, pv: [move] });
const mate = (multipv: number, move: string, value: number): EngineLine => ({ multipv, depth: 18, score: { type: 'mate', value }, pv: [move] });

// Positions (all legal).
const BACK_RANK = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'; // Ta8# is the only mate
const TWO_MATES = 'k7/8/1K6/8/8/8/8/2Q4R w - - 0 1'; // Dc8# and Th8# both mate
const HANGING = '6k1/3r2pp/2p5/4N3/8/8/5PPP/6K1 w - - 0 1'; // Sxd7 wins a rook
const KQK = '8/8/8/4k3/8/8/8/3QK3 w - - 0 1';
const MATE_IN_TWO = 'k7/8/2K5/8/8/8/8/7R w - - 0 1'; // Kb6 and Kc7 both mate in 2

function findMove(over: Partial<Extract<LessonStep, { type: 'find_move' }>> = {}): LessonStep {
  return {
    id: 'aufgabe',
    type: 'find_move',
    promptDe: 'Weiß am Zug. Setze matt.',
    fen: BACK_RANK,
    solution: [{ move: 'a1a8', children: [] }],
    acceptAnyMate: true,
    claim: { kind: 'mate', mateIn: 1 },
    hintsDe: ['Die Grundreihe ist schwach.'],
    explanationDe: 'Ta8# ist Matt.',
    ...over,
  } as LessonStep;
}

function quiz(id: string, over: Partial<Extract<LessonStep, { type: 'quiz' }>> = {}): LessonStep {
  return {
    id,
    type: 'quiz',
    questionDe: 'Was liegt vor?',
    options: [
      { id: 'a', textDe: 'Matt', correct: true },
      { id: 'b', textDe: 'Patt', correct: false },
    ],
    ...over,
  } as LessonStep;
}

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'test-lektion',
    courseId: 'test-kurs',
    order: 1,
    version: 1,
    kind: 'lesson',
    titleDe: 'Testlektion',
    summaryDe: 'Eine kurze Lektion zum Testen.',
    practiceThemes: ['mateIn1'],
    sources: ['FIDE-Schachregeln 2023, Art. 5.1.1 (Schachmatt)'],
    steps: [
      { id: 'intro', type: 'explanation', textDe: 'Hier lernst du das Grundreihenmatt.' },
      { id: 'demo', type: 'demo', startFen: BACK_RANK, moves: [{ uci: 'a1a8', commentDe: 'Ta8#' }] },
      quiz('quiz-1'),
      findMove(),
      quiz('quiz-2'),
    ],
    ...over,
  };
}

const course = (over: Partial<CourseMeta> = {}): CourseMeta => ({
  id: 'test-kurs',
  stage: 1,
  order: 1,
  version: 1,
  titleDe: 'Testkurs',
  descriptionDe: 'Ein Kurs zum Testen.',
  status: 'available',
  lessonIds: ['test-lektion'],
  testLessonId: 'test-kurs-test',
  ...over,
});

function content(lessons: Lesson[], courses: CourseMeta[] = [course()]): LessonContent {
  return {
    catalog: { courses },
    files: lessons.map((l) => ({ file: `content/lessons/${l.courseId}/${l.id}.json`, raw: l })),
    strayFiles: [],
  };
}

const messages = (f: { errors: Array<{ message: string }> }) => f.errors.map((e) => e.message).join('\n');

describe('legality (acceptance: illegal FEN, illegal move, false quiz assert)', () => {
  it('reports an illegal FEN', () => {
    const r = checkStepStatic(findMove({ fen: '6k1/5ppp/8/8/8/8/5PPP/R5KK w - - 0 1' }));
    expect(messages(r)).toMatch(/FEN ist nicht regelgemäß/);
  });

  it('reports an illegal solution move, an illegal reply and an illegal demo move', () => {
    expect(messages(checkStepStatic(findMove({ solution: [{ move: 'a1b8', children: [] }], claim: { kind: 'rule' } })))).toMatch(
      /a1b8 ist nicht regelgemäß/,
    );
    const reply = findMove({
      fen: HANGING,
      claim: { kind: 'best' },
      acceptAnyMate: false,
      solution: [{ move: 'e5d7', children: [{ move: 'g8g6', children: [] }] }],
    });
    expect(messages(checkStepStatic(reply))).toMatch(/Antwort .*g8g6 ist nicht regelgemäß/);
    const demo: LessonStep = { id: 'demo', type: 'demo', startFen: BACK_RANK, moves: [{ uci: 'a1a8' }, { uci: 'a8a1' }, { uci: 'g8h8' }] };
    expect(messages(checkStepStatic(demo))).toMatch(/Demo-Zug 2 \(a8a1\) ist nicht regelgemäß/);
  });

  it('checks quiz asserts with lib/chess and reports a false one', () => {
    const stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
    const ok = quiz('q', {
      fen: stalemate,
      asserts: [
        { kind: 'isStalemate', fen: stalemate, expect: true },
        { kind: 'isCheckmate', fen: stalemate, expect: false },
        { kind: 'isCheck', fen: stalemate, expect: false },
        { kind: 'isLegalMove', fen: BACK_RANK, move: 'a1a8', expect: true },
        { kind: 'isInsufficientMaterial', fen: '8/8/4k3/8/8/3KB3/8/8 w - - 0 1', expect: true },
      ],
    });
    expect(checkStepStatic(ok).errors).toEqual([]);
    const wrong = quiz('q', { fen: stalemate, asserts: [{ kind: 'isCheckmate', fen: stalemate, expect: true }] });
    expect(messages(checkStepStatic(wrong))).toMatch(/Prüfung 1 \(isCheckmate = true\) stimmt nicht/);
    const illegal = quiz('q', { asserts: [{ kind: 'bestMove', fen: BACK_RANK, move: 'a1b8' }] });
    expect(messages(checkStepStatic(illegal))).toMatch(/bestMove a1b8.*nicht regelgemäß/);
  });

  it('rejects exercises in finished positions', () => {
    const over = findMove({ fen: '3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1', claim: { kind: 'rule' }, solution: [{ move: 'g8h8', children: [] }] });
    expect(messages(checkStepStatic(over))).toMatch(/schon beendet/);
  });
});

describe('mate claims', () => {
  it('accepts a correct mate in 1 and checks it exactly', () => {
    expect(checkStepStatic(findMove()).errors).toEqual([]);
    expect(messages(checkStepStatic(findMove({ solution: [{ move: 'a1a7', children: [] }] })))).toMatch(/setzt nicht matt/);
  });

  it('reports a missing alternative mate (acceptance)', () => {
    const step = findMove({ fen: TWO_MATES, acceptAnyMate: false, solution: [{ move: 'c1c8', children: [] }] });
    expect(messages(checkStepStatic(step))).toMatch(/Alternatives Matt Th8# .*wird nicht akzeptiert/);
    // acceptAnyMate covers every immediate mate.
    expect(checkStepStatic({ ...step, acceptAnyMate: true } as LessonStep).errors).toEqual([]);
  });

  it('confirms mate in 2 with the engine and reports a missing alternative first move', async () => {
    const engine = new FakeEngineService({
      lines: { [MATE_IN_TWO]: [mate(1, 'c6c7', 2), mate(2, 'c6b6', 2), mate(3, 'h1h8', 3), cp(4, 'h1h2', 900)] },
    });
    const both = findMove({
      fen: MATE_IN_TWO,
      claim: { kind: 'mate', mateIn: 2 },
      solution: [
        { move: 'c6b6', children: [{ move: 'a8b8', children: [{ move: 'h1h8', children: [] }] }] },
        { move: 'c6c7', children: [{ move: 'a8a7', children: [{ move: 'h1a1', children: [] }] }] },
      ],
    });
    expect(checkStepStatic(both).errors).toEqual([]);
    expect((await checkStepWithEngine(both, engine)).errors).toEqual([]);
    const one = findMove({
      fen: MATE_IN_TWO,
      claim: { kind: 'mate', mateIn: 2 },
      solution: [{ move: 'c6b6', children: [{ move: 'a8b8', children: [{ move: 'h1h8', children: [] }] }] }],
    });
    expect(messages(await checkStepWithEngine(one, engine))).toMatch(/Alternatives Matt in 2: Kc7 fehlt/);
  });

  it('reports a wrong mate distance and a branch that does not end in mate', async () => {
    const engine = new FakeEngineService({ lines: { [MATE_IN_TWO]: [mate(1, 'c6c7', 2)] } });
    const claim3 = findMove({ fen: MATE_IN_TWO, claim: { kind: 'mate', mateIn: 3 }, solution: [{ move: 'c6c7', children: [{ move: 'a8a7', children: [] }] }] });
    expect(messages(checkStepStatic(claim3))).toMatch(/fehlt der nächste Zug/);
    expect(messages(await checkStepWithEngine(claim3, engine))).toMatch(/Matt in 2, behauptet ist Matt in 3/);
  });
});

describe('best-move claims (acceptance: wrong best move)', () => {
  const step = findMove({ fen: HANGING, claim: { kind: 'best' }, acceptAnyMate: false, solution: [{ move: 'e5d7', children: [] }] });

  it('passes when the accepted move is best by at least 0.10 expected points', async () => {
    const engine = new FakeEngineService({ lines: { [HANGING]: [cp(1, 'e5d7', 600), cp(2, 'g2g3', -450)] } });
    expect((await checkStepWithEngine(step, engine)).errors).toEqual([]);
    // Short position: MultiPV over all legal moves.
    expect(engine.calls[0]!.opts).toMatchObject({ depth: 18, multiPv: 16 });
  });

  it('reports a wrong best move', async () => {
    const engine = new FakeEngineService({ lines: { [HANGING]: [cp(1, 'e5c6', 650), cp(2, 'e5d7', 600)] } });
    expect(messages(await checkStepWithEngine(step, engine))).toMatch(/Die Engine spielt Sxc6/);
  });

  it('reports a non-unique solution', async () => {
    const engine = new FakeEngineService({ lines: { [HANGING]: [cp(1, 'e5d7', 600), cp(2, 'e5c6', 560)] } });
    expect(messages(await checkStepWithEngine(step, engine))).toMatch(/nicht eindeutig: Sxc6/);
  });

  it('checks the engine best move of quiz asserts', async () => {
    const q = quiz('q', { fen: HANGING, asserts: [{ kind: 'bestMove', fen: HANGING, move: 'e5d7' }] });
    const good = new FakeEngineService({ lines: { [HANGING]: [cp(1, 'e5d7', 600), cp(2, 'g2g3', -450)] } });
    expect((await checkStepWithEngine(q, good)).errors).toEqual([]);
    const bad = new FakeEngineService({ lines: { [HANGING]: [cp(1, 'g2g3', 50), cp(2, 'e5d7', 40)] } });
    expect(messages(await checkStepWithEngine(q, bad))).toMatch(/Die Engine spielt g3/);
  });
});

describe('play_out goals (acceptance: unwinnable checkmate goal)', () => {
  const playOut = (over: Partial<Extract<LessonStep, { type: 'play_out' }>>): LessonStep =>
    ({
      id: 'ausspielen',
      type: 'play_out',
      promptDe: 'Setze matt.',
      fen: KQK,
      userColor: 'w',
      goal: 'checkmate',
      maxMoves: 20,
      botElo: 'max',
      successDe: 'Matt!',
      failDe: 'Noch einmal.',
      ...over,
    }) as LessonStep;

  it('accepts a winning checkmate goal', async () => {
    const engine = new FakeEngineService({ lines: { [KQK]: [mate(1, 'd1d7', 7)] } });
    expect((await checkStepWithEngine(playOut({}), engine)).errors).toEqual([]);
  });

  it('reports an unwinnable checkmate goal and a mate that does not fit into maxMoves', async () => {
    const drawn = new FakeEngineService({ lines: { [KQK]: [cp(1, 'd1d7', 20)] } });
    expect(messages(await checkStepWithEngine(playOut({}), drawn))).toMatch(/Ziel Matt, aber die Engine bewertet nur 0\.20/);
    const long = new FakeEngineService({ lines: { [KQK]: [mate(1, 'd1d7', 9)] } });
    expect(messages(await checkStepWithEngine(playOut({ maxMoves: 5 }), long))).toMatch(/braucht 9 Züge.*maxMoves ist 5/);
  });

  it('requires draw goals to be drawable', async () => {
    const engine = new FakeEngineService({ lines: { [KQK]: [cp(1, 'd1d7', 900)] } });
    expect(messages(await checkStepWithEngine(playOut({ goal: 'draw', userColor: 'b' }), engine))).toMatch(/Ziel Remis/);
  });
});

describe('structure, terminology and sources', () => {
  it('enforces step count, step types, the opening explanation and the final exercises', () => {
    expect(checkStructure(lesson()).errors).toEqual([]);
    const bad = lesson({ steps: [quiz('a'), quiz('b'), { id: 'e', type: 'explanation', textDe: 'Text.' }] });
    const m = messages(checkStructure(bad));
    expect(m).toMatch(/3 Schritte/);
    expect(m).toMatch(/Nur 2 Schritttypen/);
    expect(m).toMatch(/mit einer Erklärung beginnen/);
    expect(m).toMatch(/letzten 2 Schritte/);
  });

  it('lints forbidden terms, English notation and long sentences, and requires DSB terms', () => {
    const r = lintTexts(
      [
        { where: 'a', text: 'Das ist ein Stalemate.' },
        { where: 'b', text: 'Spiele Nf3 und dann O-O.' },
        { where: 'c', text: 'Das Pferd springt, die Königin zieht.' },
        { where: 'd', text: 'Die Partie endet unentschieden durch dreifache Wiederholung.' },
        { where: 'e', text: 'Spiele Sf3, Lxf7+, Dxh7#, e8=D und 0-0.' },
        { where: 'f', text: 'eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig einundzwanzig zweiundzwanzig dreiundzwanzig.' },
      ],
      ['Patt'],
    );
    const m = messages(r);
    expect(m).toMatch(/„Stalemate“ – verwende Patt/);
    expect(m).toMatch(/„Nf3“/);
    expect(m).toMatch(/„O-O“/);
    expect(m).toMatch(/„Pferd“/);
    expect(m).toMatch(/„Königin“/);
    expect(m).toMatch(/„unentschieden“/);
    expect(m).toMatch(/dreifache Wiederholung/);
    expect(m).toMatch(/DSB-Begriff „Patt“ fehlt/);
    expect(r.errors.filter((e) => e.id === 'e')).toEqual([]);
    expect(r.warnings.map((w) => w.id)).toEqual(['f']);
  });

  it('requires FIDE article references for rule lessons and rejects unknown articles', () => {
    expect(messages(checkSources(lesson({ sources: [] }), true))).toMatch(/Quelle mit FIDE-Artikel/);
    expect(messages(checkSources(lesson({ sources: ['FIDE-Schachregeln 2023, Art. 3.99 (Erfunden)'] }), false))).toMatch(/Art\. 3\.99 gibt es/);
    expect(checkSources(lesson({ sources: ['FIDE-Schachregeln 2023, Art. 3.8.2 (Rochade)', 'FIDE-Schachregeln 2023, Anhang C'] }), true).errors).toEqual([]);
    // A Stufe-1 lesson that mentions a special rule needs a FIDE source.
    const castling = lesson({ sources: [], steps: [...lesson().steps.slice(0, 2), { id: 'x', type: 'explanation', textDe: 'Die Rochade bringt den König in Sicherheit.' }, ...lesson().steps.slice(3)] });
    expect(messages(checkLessonStatic(castling, 1))).toMatch(/Quelle mit FIDE-Artikel/);
  });

  it('checks puzzle flags and practice themes', () => {
    const flagged = lesson({
      practiceThemes: [],
      steps: lesson().steps.map((s) => (s.type === 'find_move' ? { ...s, puzzle: { rating: 900, themes: ['backRankMate', 'nope'] } } : s)) as LessonStep[],
    });
    const m = messages(checkLessonStatic(flagged, 1));
    expect(m).toMatch(/Puzzle-Rating 900/);
    expect(m).toMatch(/Unbekanntes Puzzle-Thema „nope“/);
    expect(m).toMatch(/braucht das Thema mateIn1/);
    expect(m).toMatch(/ab Stufe 1 brauchen practiceThemes/);
    expect(checkLessonStatic(lesson(), 1).errors).toEqual([]);
  });
});

describe('catalog, files and course rules', () => {
  it('checks ids, paths, kinds, order and missing files', () => {
    const wrongOrder = lesson({ order: 3 });
    const stray = { ...lesson({ id: 'fremd' }), kind: 'lesson' as const };
    const r = checkCatalogAndFiles(content([wrongOrder, stray]));
    const m = messages(r);
    expect(m).toMatch(/order ist 3, erwartet 1/);
    expect(m).toMatch(/weder in lessonIds noch als testLessonId/);
    expect(m).toMatch(/Lektionsdatei fehlt/);
    const mismatch = checkCatalogAndFiles({ ...content([lesson()]), files: [{ file: 'content/lessons/test-kurs/anders.json', raw: lesson() }] });
    expect(messages(mismatch)).toMatch(/Dateiname verlangt „anders“/);
    expect(messages(checkCatalogAndFiles({ catalog: undefined, files: [], strayFiles: ['content/lessons/notes.txt'] }))).toMatch(/Katalog fehlt[\s\S]*nicht unter content/);
  });

  it('requires an Ausspielen step per course and the KQ/KR play-outs in Grundmatts', () => {
    const courses = [course({ id: 'grundmatts', lessonIds: ['test-lektion'] })];
    const l = { file: 'x', lesson: lesson({ courseId: 'grundmatts' }), course: courses[0] };
    const m = messages(checkCourseRules(courses, [l]));
    expect(m).toMatch(/mindestens einen Ausspielen-Schritt/);
    expect(m).toMatch(/Ausspielen mit KQ-K fehlt/);
    expect(materialSignature(KQK)).toBe('KQ-K');
    expect(materialSignature('8/8/8/4k3/8/8/8/R3K3 b - - 0 1')).toBe('KR-K');
  });

  it('checks the launch scope', () => {
    const m = messages(checkLaunchScope([course()], [{ file: 'x', lesson: lesson(), course: course() }]));
    expect(m).toMatch(/1 verfügbare Kurse – erwartet 6/);
    expect(m).toMatch(/0 Einstufungstests/);
    expect(m).toMatch(/Geplante Kurse/);
  });
});

describe('validateLessonContent / readLessonContent', () => {
  function writeTree(): string {
    const root = mkdtempSync(join(tmpdir(), 'zz-lessons-'));
    dirs.push(root);
    const dir = join(root, 'content/lessons/test-kurs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(root, 'content/lessons/catalog.json'), JSON.stringify({ courses: [course({ testLessonId: undefined })] }));
    writeFileSync(join(dir, 'test-lektion.json'), JSON.stringify(lesson()));
    writeFileSync(join(dir, 'kaputt.json'), '{ nope');
    writeFileSync(join(root, 'content/lessons/README.md'), '# x');
    return root;
  }

  it('reads the tree, reports broken files and skips the engine in quick mode', async () => {
    const root = writeTree();
    const read = readLessonContent(root);
    expect(read.files.map((f) => f.file).sort()).toEqual(['content/lessons/test-kurs/kaputt.json', 'content/lessons/test-kurs/test-lektion.json']);
    expect(read.strayFiles).toEqual(['content/lessons/README.md']);
    const engine = new FakeEngineService();
    const report = await validateLessonContent(read, ctx(engine, true));
    const m = messages(report);
    expect(m).toMatch(/Kein gültiges JSON/);
    expect(m).toMatch(/README\.md|nicht unter content/);
    expect(m).toMatch(/Ausspielen-Schritt/);
    expect(engine.calls).toHaveLength(0);
    expect(report.checked).toBe(5);
  });

  it('runs engine checks once per step and caches them', async () => {
    const hanging = lesson({
      steps: lesson().steps.map((s) =>
        s.type === 'find_move' ? findMove({ fen: HANGING, claim: { kind: 'best' }, acceptAnyMate: false, solution: [{ move: 'e5d7', children: [] }] }) : s,
      ),
    });
    const engine = new FakeEngineService({ lines: { [HANGING]: [cp(1, 'e5c6', 650), cp(2, 'e5d7', 600)] } });
    const c = ctx(engine);
    const first = await validateLessonContent(content([hanging]), c);
    expect(messages(first)).toMatch(/Die Engine spielt Sxc6/);
    const calls = engine.calls.length;
    await validateLessonContent(content([hanging]), c);
    expect(engine.calls.length).toBe(calls);
  });
});

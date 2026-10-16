import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { paths, ROUTE_PATTERNS } from './paths';

describe('paths (BACKLOG 2.3)', () => {
  it('has every binding builder', () => {
    expect(Object.keys(paths).sort()).toEqual(
      [
        'home', 'onboarding', 'login', 'authCallback', 'puzzles', 'puzzlesRated', 'puzzlesLearn', 'puzzleThemes', 'puzzleTheme',
        'puzzlesDemo', 'play', 'playGame', 'playFromPosition', 'learn', 'course', 'lesson', 'analysis', 'analysisImport',
        'analysisBoard', 'analysisGame', 'profile', 'stats', 'settings',
      ].sort(),
    );
    expect(Object.keys(ROUTE_PATTERNS).sort()).toEqual(Object.keys(paths).sort());
  });

  it('builds the documented URLs', () => {
    expect(paths.home()).toBe('/');
    expect(paths.puzzleTheme('backRankMate')).toBe('/puzzles/themes/backRankMate');
    expect(paths.playGame('abc-1')).toBe('/play/game/abc-1');
    expect(paths.lesson('brett-und-figuren', 'der-turm')).toBe('/learn/brett-und-figuren/der-turm');
    expect(paths.analysisGame('g 1')).toBe('/analysis/g%201');
    expect(paths.stats()).toBe('/profile/stats');
    expect(paths.analysisBoard()).toBe('/analysis/board');
  });

  it('encodes FEN and PGN query parameters so they round-trip', () => {
    const url = new URL(paths.playFromPosition(START_FEN), 'http://x');
    expect(url.pathname).toBe('/play/position');
    expect(url.searchParams.get('fen')).toBe(START_FEN);
    const board = new URL(paths.analysisBoard({ fen: START_FEN, pgn: '1. e4 e5 *' }), 'http://x');
    expect(board.searchParams.get('fen')).toBe(START_FEN);
    expect(board.searchParams.get('pgn')).toBe('1. e4 e5 *');
  });

  it('every pattern matches the builder output', () => {
    const toRegex = (p: string) => new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+')}$`);
    expect(paths.puzzleTheme('fork')).toMatch(toRegex(ROUTE_PATTERNS.puzzleTheme));
    expect(paths.course('c')).toMatch(toRegex(ROUTE_PATTERNS.course));
    expect(paths.analysisGame('x')).toMatch(toRegex(ROUTE_PATTERNS.analysisGame));
  });
});

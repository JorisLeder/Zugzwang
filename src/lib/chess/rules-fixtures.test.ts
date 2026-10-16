/**
 * Runs all 65 rules fixtures of docs/team/RULES.md §6.2 (FIDE Laws 2023) against `ChessGame`.
 * Reasons in the fixtures use the auditor's short names; they map to our `GameEndReason`s below.
 */
import { describe, expect, it } from 'vitest';
import { START_FEN, type Color, type GameEndReason, type MoveInput } from '@/core/chess';
import { ChessGame } from './game';
import { cannotMate } from './material';
import fixtureFile from './__fixtures__/rules-fixtures.json';

interface Fixture {
  id: string;
  art: string;
  fen: string;
  moves: string[];
  legal?: string[];
  illegal?: string[];
  pieceMoves?: Record<string, string[]>;
  allMoves?: string[];
  rejected?: Array<string | { from: string; to: string; promotion?: string }>;
  sanOf?: Record<string, string>;
  fenAfter?: string;
  status?: { over: boolean; result?: string; reason?: string; claims?: string[] };
  insufficient?: boolean;
  fideDead?: boolean;
  cannotMate?: Record<Color, boolean>;
  onFlag?: Record<Color, string>;
  onResign?: Record<Color, string>;
  mateDemo?: string;
  fideIllegal?: string[];
  note?: string;
}

const REASONS: Record<string, GameEndReason> = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  dead_position: 'insufficient_material',
  fivefold: 'fivefold_repetition',
  seventyfive: 'seventyfive_moves',
};
const CLAIMS: Record<string, string> = { threefold: 'threefold_repetition', fifty: 'fifty_moves' };

const fixtures = (fixtureFile as { fixtures: Fixture[] }).fixtures;

function setup(f: Fixture): ChessGame {
  const game = ChessGame.fromFen(f.fen === 'startpos' ? START_FEN : f.fen);
  for (const san of f.moves) {
    const rec = game.move(san);
    if (!rec) throw new Error(`${f.id}: move ${san} rejected`);
  }
  return game;
}

describe('RULES.md §6.2 fixtures', () => {
  it('has all 65 fixtures', () => {
    expect(fixtures).toHaveLength(65);
  });

  for (const f of fixtures) {
    it(`${f.id} (FIDE ${f.art})${f.note ? ` – ${f.note}` : ''}`, () => {
      const game = setup(f);
      const sans = game.legalMoves().map((m) => m.san);

      for (const san of f.legal ?? []) expect(sans, `${san} should be legal`).toContain(san);
      for (const san of f.illegal ?? []) expect(sans, `${san} should be illegal`).not.toContain(san);
      // FIDE-illegal moves chess.js would generate from a dirty FEN must be gone after normalisation.
      for (const san of f.fideIllegal ?? []) expect(sans, `${san} must not be generated`).not.toContain(san);

      for (const [square, expected] of Object.entries(f.pieceMoves ?? {})) {
        const got = game.legalMoves(square as MoveInput['from']).map((m) => m.san);
        expect([...got].sort()).toEqual([...expected].sort());
      }
      if (f.allMoves) expect([...sans].sort()).toEqual([...f.allMoves].sort());

      for (const input of f.rejected ?? []) {
        const probe = setup(f);
        expect(probe.move(input as MoveInput | string), JSON.stringify(input)).toBeNull();
        expect(probe.fen()).toBe(game.fen());
      }

      for (const [input, san] of Object.entries(f.sanOf ?? {})) {
        const probe = setup(f);
        expect(probe.move(input)?.san).toBe(san);
      }

      if (f.fenAfter) expect(game.fen()).toBe(f.fenAfter);

      if (f.status) {
        const s = game.status();
        expect(s.isOver).toBe(f.status.over);
        if (f.status.result) expect(s.result).toBe(f.status.result);
        if (f.status.reason) expect(s.reason).toBe(REASONS[f.status.reason]);
        if (f.status.claims) expect(s.claimableDraws).toEqual(f.status.claims.map((c) => CLAIMS[c]));
      }

      if (f.insufficient !== undefined) {
        // chess.js insufficient-material subset (D-05) is what ends the game automatically.
        expect(game.status().reason === 'insufficient_material').toBe(f.insufficient);
      }

      for (const color of ['w', 'b'] as const) {
        if (f.cannotMate) expect(cannotMate(game.fen(), color), `cannotMate ${color}`).toBe(f.cannotMate[color]);
        if (f.onFlag) expect(setup(f).flagFall(color).result, `flag ${color}`).toBe(f.onFlag[color]);
        if (f.onResign) expect(setup(f).resign(color).result, `resign ${color}`).toBe(f.onResign[color]);
      }

      if (f.mateDemo) {
        const demo = ChessGame.fromFen(f.mateDemo).status();
        expect(demo.reason).toBe('checkmate');
      }
    });
  }
});

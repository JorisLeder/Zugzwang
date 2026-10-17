/**
 * The five Lernpfad stages (PRD Lektionen §4, "Lehrplan über die gesamte Schachlaufbahn").
 */
import type { StageId } from '@/core/lessons';
import { LESSONS_DE } from './strings.de';

/** One stage of the Lernpfad. */
export interface StageMeta {
  id: StageId;
  /** "Neuling", "Einsteiger", … */
  nameDe: string;
  /** "Stufe 1 · Einsteiger". */
  titleDe: string;
  /** "ca. 400–800 Elo". */
  eloDe: string;
  /** Approximate Elo range (inclusive), used to pick a practice bot when there is no bot rating yet. */
  elo: { min: number; max: number };
}

const RANGES: Record<StageId, { min: number; max: number }> = {
  0: { min: 0, max: 400 },
  1: { min: 400, max: 800 },
  2: { min: 800, max: 1200 },
  3: { min: 1200, max: 1600 },
  4: { min: 1600, max: 2000 },
};

/** All stages 0–4 in order. */
export const STAGE_IDS: readonly StageId[] = [0, 1, 2, 3, 4];

/** Stage metadata, index = stage id. */
export const STAGES: readonly StageMeta[] = STAGE_IDS.map((id) => ({
  id,
  nameDe: LESSONS_DE.stages[id].name,
  titleDe: LESSONS_DE.stageTitle(id, LESSONS_DE.stages[id].name),
  eloDe: LESSONS_DE.stages[id].elo,
  elo: RANGES[id],
}));

/** Metadata of one stage. */
export function stageMeta(id: StageId): StageMeta {
  return STAGES[id]!;
}

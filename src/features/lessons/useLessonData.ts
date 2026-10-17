/**
 * Data hooks of the lesson pages: the catalog (with the fixture course in e2e builds, D-52), one lesson with its saved
 * progress, the live progress map, the learner (profile fields of the unlock rules), the bot rating and the Stufe-0
 * skip test.
 */
import { useEffect, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import type { CourseMeta, Lesson, LessonProgress } from '@/core/lessons';
import type { Profile } from '@/core/profile';
import type { RatingRecord } from '@/core/rating';
import { useSubscribable } from '@/lib/observable';
import {
  findSkipTest,
  loadCatalog,
  loadCourseLessons,
  loadLesson,
  toProgressMap,
  type ContentError,
  type LearnerState,
  type LessonCatalogData,
  type LessonLoadResult,
  type ProgressMap,
  type SkipTestRef,
  type UnlockContext,
} from '@/lessons';

/** Whether content errors are shown to authors (development and e2e builds, never in production). */
export function showContentErrors(e2e: boolean): boolean {
  return import.meta.env.DEV || e2e;
}

/** The catalog, `null` while loading. */
export function useLessonCatalog(): LessonCatalogData | null {
  const { config } = useServices();
  const [catalog, setCatalog] = useState<LessonCatalogData | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCatalog({ e2e: config.e2e }).then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, [config.e2e]);
  return catalog;
}

/** A loaded lesson with the progress saved when it was opened. */
export type LessonData = { status: 'loading' } | { status: 'ready'; result: LessonLoadResult; saved: LessonProgress | null };

/** Loads one lesson and its saved progress (read once – the player owns the progress while it runs). */
export function useLesson(courseId: string, lessonId: string): LessonData {
  const { config, data } = useServices();
  const key = `${courseId}/${lessonId}`;
  const [state, setState] = useState<{ key: string; value: LessonData }>({ key: '', value: { status: 'loading' } });
  useEffect(() => {
    let alive = true;
    void Promise.all([
      loadLesson(courseId, lessonId, { e2e: config.e2e }),
      data.repos.lessonProgress.get(lessonId).catch((err: unknown) => {
        console.warn('Lesson progress could not be read', err);
        return null;
      }),
    ]).then(([result, saved]) => alive && setState({ key, value: { status: 'ready', result, saved } }));
    return () => {
      alive = false;
    };
  }, [courseId, lessonId, key, config.e2e, data]);
  return state.key === key ? state.value : { status: 'loading' };
}

/** Live progress of all lessons, `undefined` while loading. */
export function useProgressMap(): ProgressMap | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.lessonProgress.observeAll(), [data]);
  const list = useSubscribable<LessonProgress[] | undefined>(source, undefined);
  return useMemo(() => (list ? toProgressMap(list) : undefined), [list]);
}

/** Live profile, `undefined` while loading, `null` before it exists. */
export function useProfile(): Profile | null | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.profile.observe(), [data]);
  return useSubscribable<Profile | null | undefined>(source, undefined);
}

/** Learner state of the unlock rules from the profile. */
export function learnerOf(profile: Profile | null): LearnerState {
  return profile ? { selfAssessment: profile.selfAssessment, stageZeroSkipped: profile.stageZeroSkipped } : null;
}

/** Live bot rating, `undefined` while loading, `null` without one. */
export function useBotRating(): RatingRecord | null | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.ratings.observe('bot'), [data]);
  return useSubscribable<RatingRecord | null | undefined>(source, undefined);
}

/** Everything the unlock rules need, `null` while loading. */
export function useUnlockContext(catalog: LessonCatalogData | null): UnlockContext | null {
  const progress = useProgressMap();
  const profile = useProfile();
  return useMemo(() => {
    if (!catalog || !progress || profile === undefined) return null;
    return { courses: catalog.courses, progress, learner: learnerOf(profile) };
  }, [catalog, progress, profile]);
}

/** The Stufe-0 skip test, `undefined` while searching, `null` if there is none. */
export function useSkipTest(catalog: LessonCatalogData | null): SkipTestRef | null | undefined {
  const { config } = useServices();
  const [found, setFound] = useState<{ catalog: LessonCatalogData; ref: SkipTestRef | null } | null>(null);
  useEffect(() => {
    if (!catalog) return undefined;
    let alive = true;
    void findSkipTest(catalog, { e2e: config.e2e }).then(
      (ref) => alive && setFound({ catalog, ref }),
      () => alive && setFound({ catalog, ref: null }),
    );
    return () => {
      alive = false;
    };
  }, [catalog, config.e2e]);
  return found && found.catalog === catalog ? found.ref : undefined;
}

/** Lessons of a course by id (broken files are missing and reported), `null` while loading. */
export function useCourseLessons(course: CourseMeta | null): CourseLessonsData | null {
  const { config } = useServices();
  const [state, setState] = useState<{ course: CourseMeta; value: CourseLessonsData } | null>(null);
  useEffect(() => {
    if (!course) return undefined;
    let alive = true;
    void loadCourseLessons(course, { e2e: config.e2e }).then(
      (r) => alive && setState({ course, value: { byId: new Map(r.lessons.map((l) => [l.id, l])), errors: r.errors } }),
    );
    return () => {
      alive = false;
    };
  }, [course, config.e2e]);
  return state && state.course === course ? state.value : null;
}

/** Result of `useCourseLessons`. */
export interface CourseLessonsData {
  byId: ReadonlyMap<string, Lesson>;
  errors: ContentError[];
}

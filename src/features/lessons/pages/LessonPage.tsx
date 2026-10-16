import { useParams } from 'react-router';
import { PlaceholderPage } from '@/ui/layout/PlaceholderPage';
import { STRINGS_DE } from '../strings.de';

/** Lektion – PLACEHOLDER (WP-00); owned by WP-06. */
export function Component() {
  const { courseId = '', lessonId = '' } = useParams();
  return <PlaceholderPage title={STRINGS_DE.lesson} subtitle={`Kurs ${courseId} · Lektion ${lessonId}`} />;
}

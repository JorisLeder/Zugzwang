import { useParams } from 'react-router';
import { PlaceholderPage } from '@/ui/layout/PlaceholderPage';
import { STRINGS_DE } from '../strings.de';

/** Kurs – PLACEHOLDER (WP-00); owned by WP-06. */
export function Component() {
  const { courseId = '' } = useParams();
  return <PlaceholderPage title={STRINGS_DE.course} subtitle={`Kurs ${courseId}`} />;
}

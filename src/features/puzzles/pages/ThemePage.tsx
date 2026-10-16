import { useParams } from 'react-router';
import { puzzleThemeById } from '@/core/puzzles';
import { PlaceholderPage } from '@/ui/layout/PlaceholderPage';
import { STRINGS_DE } from '../strings.de';

/** Themen-Training – PLACEHOLDER (WP-00); owned by WP-03. */
export function Component() {
  const { themeId = '' } = useParams();
  const theme = puzzleThemeById(themeId);
  return <PlaceholderPage title={STRINGS_DE.puzzleTheme} subtitle={theme ? theme.labelDe : themeId} />;
}

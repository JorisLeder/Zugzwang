import { useParams } from 'react-router';
import { PlaceholderPage } from '@/ui/layout/PlaceholderPage';
import { STRINGS_DE } from '../strings.de';

/** Partieanalyse – PLACEHOLDER (WP-00); owned by WP-05. */
export function Component() {
  const { gameId = '' } = useParams();
  return <PlaceholderPage title={STRINGS_DE.analysisGame} subtitle={`Partie ${gameId}`} />;
}

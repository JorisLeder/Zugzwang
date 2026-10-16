import { useParams } from 'react-router';
import { PlaceholderPage } from '@/ui/layout/PlaceholderPage';
import { STRINGS_DE } from '../strings.de';

/** Partie – PLACEHOLDER (WP-00); owned by WP-04. */
export function Component() {
  const { gameId = '' } = useParams();
  return <PlaceholderPage title={STRINGS_DE.playGame} subtitle={`Partie ${gameId}`} />;
}

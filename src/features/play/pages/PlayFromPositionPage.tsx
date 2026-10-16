import { useSearchParams } from 'react-router';
import { PlaceholderPage } from '@/ui/layout/PlaceholderPage';
import { STRINGS_DE } from '../strings.de';

/** Aus Stellung spielen – PLACEHOLDER (WP-00); owned by WP-04. */
export function Component() {
  const [params] = useSearchParams();
  const fen = params.get('fen');
  return <PlaceholderPage title={STRINGS_DE.playFromPosition} subtitle={fen ? `FEN: ${fen}` : undefined} />;
}

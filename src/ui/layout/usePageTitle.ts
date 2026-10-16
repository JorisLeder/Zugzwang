import { useEffect } from 'react';
import { LAYOUT_DE } from './strings.de';

/** Sets `document.title` to "{title} · Zugzwang". */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${LAYOUT_DE.pageTitleSuffix}` : LAYOUT_DE.pageTitleSuffix;
  }, [title]);
}

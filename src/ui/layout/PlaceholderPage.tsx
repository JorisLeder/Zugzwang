import { Construction } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/ui/primitives';
import { Page } from './Page';
import { LAYOUT_DE } from './strings.de';

/** Props of `PlaceholderPage`. */
export interface PlaceholderPageProps {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}

/** "Dieser Bereich ist in Arbeit" page used by the WP-00 route placeholders until the owning package delivers. */
export function PlaceholderPage({ title, subtitle, children }: PlaceholderPageProps) {
  return (
    <Page title={title} subtitle={subtitle}>
      <EmptyState icon={<Construction />} title={LAYOUT_DE.inProgressTitle} text={LAYOUT_DE.inProgressText} />
      {children}
    </Page>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePageTitle } from './usePageTitle';

/** Props of `Page`. */
export interface PageProps {
  /** Page title: h1 and document title. */
  title: string;
  /** Optional line under the title. */
  subtitle?: ReactNode;
  /** Actions next to the title (desktop) / below it (phone). */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Standard non-board page: centred content (max 1120 px), page gutter, h1 (DESIGN §2.6, §3.6). */
export function Page({ title, subtitle, actions, children, className }: PageProps) {
  usePageTitle(title);
  return (
    <div className={cn('mx-auto w-full max-w-[var(--zz-content-max)] px-[var(--zz-gutter)] py-6 md:py-8', className)}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 text-text">{title}</h1>
          {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

import { cn } from '@/lib/cn';

/** Zugzwang brand mark (original artwork, same as `public/favicon.svg`). Decorative. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('text-accent', className)}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" />
      <path d="M9 9h14v3.2L13.6 20H23v3H9v-3.2L18.4 12H9z" fill="var(--zz-on-accent)" />
    </svg>
  );
}

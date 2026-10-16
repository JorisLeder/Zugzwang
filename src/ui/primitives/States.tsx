import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { PRIMITIVES_DE } from './strings.de';

/** Props of `EmptyState`. */
export interface EmptyStateProps {
  /** lucide icon element (28 px, muted). */
  icon: ReactNode;
  title: string;
  /** One sentence. */
  text: string;
  /** One primary action (button/link). */
  action?: ReactNode;
  className?: string;
}

/** Empty state: icon in a 64 px circle, title, one sentence, one primary button (DESIGN §5.11). */
export function EmptyState({ icon, title, text, action, className }: EmptyStateProps) {
  return (
    <div className={cn('mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <div aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-muted [&_svg]:size-7">
        {icon}
      </div>
      <h3 className="text-h3 text-text">{title}</h3>
      <p className="text-body text-muted">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Props of `ErrorState`. */
export interface ErrorStateProps {
  /** Message; default "Das hat nicht geklappt. Versuch es nochmal." */
  message?: string;
  /** Retry handler; shows "Erneut versuchen". */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/** Inline error with retry – never a blank screen (DESIGN §5.12). */
export function ErrorState({ message = PRIMITIVES_DE.genericError, onRetry, retryLabel = PRIMITIVES_DE.retry, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-3 rounded-lg bg-danger-subtle p-4 text-text', className)}>
      <p className="flex items-start gap-2 text-body">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger-text" />
        <span>{message}</span>
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

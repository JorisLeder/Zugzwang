import { OctagonAlert, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react';
import { Collapsible } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { PRIMITIVES_DE } from './strings.de';
import { splitSentences } from './text';

/** Props of `CoachBubble`. */
export interface CoachBubbleProps {
  /** Speaker name shown above the bubble (caption, muted), e.g. "Coach" or a bot name. */
  name?: string;
  /** Avatar image URL; without it a monogram of `name` is shown. */
  avatarSrc?: string;
  /** neutral, praise (accent, ThumbsUp), warning (warning, TriangleAlert), danger (coach warning, OctagonAlert). */
  tone?: 'neutral' | 'praise' | 'warning' | 'danger';
  /** Main text. Plain strings are cut after 3 sentences; the rest moves behind "Mehr erfahren". */
  children: ReactNode;
  /** Extra details behind "Mehr erfahren" (engine line chips etc.). */
  details?: ReactNode;
  /** Action buttons under the text (e.g. "Nochmal überlegen" / "Trotzdem ziehen"). */
  actions?: ReactNode;
  /** Thumbs up/down row (PRD metric "Nützlichkeit"). */
  feedback?: { value: 1 | -1 | null; onVote: (vote: 1 | -1) => void };
  className?: string;
}

const TONE_ICON = { praise: ThumbsUp, warning: TriangleAlert, danger: OctagonAlert } as const;

/**
 * Coach avatar + speech bubble (DESIGN §5.3). Max 3 sentences visible; "Mehr erfahren" (Radix Collapsible,
 * `aria-expanded`) reveals details. The danger variant is `role="alert"`.
 */
export function CoachBubble({ name = PRIMITIVES_DE.coach, avatarSrc, tone = 'neutral', children, details, actions, feedback, className }: CoachBubbleProps) {
  const [open, setOpen] = useState(false);
  let main: ReactNode = children;
  let overflow: string | null = null;
  if (typeof children === 'string') {
    const sentences = splitSentences(children);
    if (sentences.length > 3) {
      main = sentences.slice(0, 3).join(' ');
      overflow = sentences.slice(3).join(' ');
    }
  }
  const hasMore = Boolean(details) || overflow !== null;
  const ToneIcon = tone === 'neutral' ? null : TONE_ICON[tone];

  return (
    <div className={cn('flex items-start gap-3', className)} role={tone === 'danger' ? 'alert' : undefined}>
      <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 font-semibold text-text lg:size-12">
        {avatarSrc ? <img src={avatarSrc} alt="" className="size-full object-cover" /> : name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-caption text-muted">{name}</p>
        <div
          className={cn(
            'rounded-lg rounded-tl-[4px] bg-surface-2 px-4 py-3 text-body text-text',
            tone === 'praise' && 'border-l-4 border-l-accent',
            tone === 'warning' && 'border-l-4 border-l-warning',
            tone === 'danger' && 'border-l-4 border-l-danger',
          )}
        >
          <Collapsible.Root open={open} onOpenChange={setOpen}>
            <div className="flex items-start gap-2">
              {ToneIcon && (
                <ToneIcon
                  aria-hidden="true"
                  className={cn(
                    'mt-1 size-4 shrink-0',
                    tone === 'praise' && 'text-accent-text',
                    tone === 'warning' && 'text-warning-text',
                    tone === 'danger' && 'text-danger-text',
                  )}
                />
              )}
              <div className="text-measure min-w-0">{main}</div>
            </div>
            {hasMore && (
              <>
                <Collapsible.Content className="mt-2 text-body text-text">
                  {overflow && <p>{overflow}</p>}
                  {details}
                </Collapsible.Content>
                <Collapsible.Trigger className="mt-2 text-body-sm font-medium text-accent-text hover:underline">
                  {open ? PRIMITIVES_DE.lessInfo : PRIMITIVES_DE.moreInfo}
                </Collapsible.Trigger>
              </>
            )}
          </Collapsible.Root>
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {feedback && <FeedbackRow {...feedback} />}
      </div>
    </div>
  );
}

function FeedbackRow({ value, onVote }: { value: 1 | -1 | null; onVote: (vote: 1 | -1) => void }) {
  const voted = value !== null;
  return (
    <div className="mt-1 flex items-center gap-1 text-body-sm text-muted">
      <span className="mr-1">{voted ? PRIMITIVES_DE.thanks : PRIMITIVES_DE.helpfulQuestion}</span>
      {([1, -1] as const).map((vote) => {
        const Icon = vote === 1 ? ThumbsUp : ThumbsDown;
        return (
          <button
            key={vote}
            type="button"
            aria-label={vote === 1 ? PRIMITIVES_DE.helpfulYes : PRIMITIVES_DE.helpfulNo}
            aria-pressed={value === vote}
            onClick={() => onVote(vote)}
            className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text aria-pressed:text-accent-text"
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

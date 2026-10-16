import { BookOpen, Check, Star, ThumbsUp, X, type LucideIcon } from 'lucide-react';
import { CLASSIFICATION_META, type MoveClassification } from '@/core/analysis';
import { cn } from '@/lib/cn';

const ICONS: Record<string, LucideIcon> = { Star, ThumbsUp, Check, BookOpen, X };

/** Props of `ClassificationBadge`. */
export interface ClassificationBadgeProps {
  classification: MoveClassification;
  /** Diameter in px (18 in lists, up to 30 on the board). */
  size?: number;
  /** Show the German label next to the badge (in `--zz-text`, never in the category colour). */
  showLabel?: boolean;
  /** Show the one-line plain meaning as native tooltip (`title`). */
  showPlainTooltip?: boolean;
  className?: string;
}

/**
 * Move-classification badge (DESIGN §2.3): reads `CLASSIFICATION_META` (symbol or lucide icon, fill and ink tokens,
 * German label). The badge has `aria-label` = label; symbols/icons are `aria-hidden`.
 */
export function ClassificationBadge({ classification, size = 18, showLabel = false, showPlainTooltip = false, className }: ClassificationBadgeProps) {
  const meta = CLASSIFICATION_META[classification];
  const Icon = meta.icon ? ICONS[meta.icon] : undefined;
  const badge = (
    <span
      role="img"
      aria-label={meta.labelDe}
      title={showPlainTooltip ? `${meta.labelDe}: ${meta.plainDe}` : undefined}
      data-classification={classification}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none light:ring-1 light:ring-black/25',
        !showLabel && className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: `var(${meta.fillVar})`,
        color: `var(${meta.inkVar})`,
        fontSize: Math.round(size * 0.6),
      }}
    >
      {Icon ? (
        <Icon aria-hidden="true" width={Math.round(size * 0.66)} height={Math.round(size * 0.66)} strokeWidth={3} fill={meta.icon === 'Star' ? 'currentColor' : 'none'} />
      ) : (
        <span aria-hidden="true">{meta.symbol}</span>
      )}
    </span>
  );
  if (!showLabel) return badge;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {badge}
      <span aria-hidden="true" className="text-body-sm text-text">
        {meta.labelDe}
      </span>
    </span>
  );
}

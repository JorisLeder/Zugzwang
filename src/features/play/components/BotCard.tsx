import type { BotProfile } from '@/core/bots';
import { cn } from '@/lib/cn';
import { Badge } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';
import { BotAvatar } from './BotAvatar';

/** Props of `BotCard`. */
export interface BotCardProps {
  bot: BotProfile;
  recommended?: boolean;
  onSelect: (bot: BotProfile) => void;
}

/** Bot card of the bot grid (DESIGN §3.6): avatar 64, name, Elo, style, one chat line – the whole card is one button. */
export function BotCard({ bot, recommended = false, onSelect }: BotCardProps) {
  return (
    <button
      type="button"
      data-bot-id={bot.id}
      aria-label={STRINGS_DE.botCardLabel(bot.name, bot.elo, bot.styleLabelDe)}
      onClick={() => onSelect(bot)}
      className={cn(
        'flex w-full items-start gap-4 rounded-lg border border-border bg-surface p-4 text-left text-text shadow-1',
        'transition-colors duration-[var(--zz-dur-fast)] hover:bg-surface-2',
        recommended && 'border-l-2 border-l-accent',
      )}
    >
      <BotAvatar bot={bot} size="lg" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-h3 text-text">{bot.name}</span>
          <span className="text-body-sm text-muted tabular-nums">{bot.elo}</span>
          {recommended && <Badge tone="accent">{STRINGS_DE.recommended}</Badge>}
        </span>
        <span className="inline-flex w-fit items-center rounded-sm bg-surface-2 px-2 py-0.5 text-body-sm font-medium text-text">{bot.styleLabelDe}</span>
        <span className="text-body-sm text-muted">„{bot.chat.greeting[0]}“</span>
      </span>
    </button>
  );
}

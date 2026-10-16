import { useState } from 'react';
import type { BotProfile } from '@/core/bots';
import { cn } from '@/lib/cn';

/** Props of `BotAvatar`. */
export interface BotAvatarProps {
  bot: Pick<BotProfile, 'name' | 'avatar'>;
  /** `sm` 28/32 px (player bar), `md` 40/48 px (coach bubble size), `lg` 64 px (bot card). */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = { sm: 'size-7 md:size-8 text-caption', md: 'size-10 lg:size-12 text-body', lg: 'size-16 text-h3' } as const;

/** The bot's own SVG portrait (decorative – the name is always next to it); monogram if the file fails to load. */
export function BotAvatar({ bot, size = 'md', className }: BotAvatarProps) {
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 font-semibold text-text', SIZES[size], className)}>
      {failed ? bot.name.slice(0, 1).toUpperCase() : <img src={bot.avatar} alt="" className="size-full object-cover" onError={() => setFailed(true)} />}
    </span>
  );
}

import { ArrowDownUp, Check, EllipsisVertical, Settings as SettingsIcon } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useSettings, useUpdateSettings } from '@/app/services';
import { cn } from '@/lib/cn';
import { IconButton } from '@/ui/primitives';
import { BOARD_DE } from './strings.de';

/** Props of `BoardMenu`. */
export interface BoardMenuProps {
  /** Shows "Brett drehen" when given. */
  onFlip?: () => void;
  className?: string;
}

const itemClass =
  'flex h-11 cursor-pointer select-none items-center gap-3 rounded-sm px-3 text-body text-text outline-none data-[highlighted]:bg-surface-3';

/**
 * The ⋮ menu of board screens (DESIGN §3.4/§6.2): "Brett drehen", quick toggle "Töne" (persists `settings.sound`) and
 * "Einstellungen". Pass it to `BoardLayout`'s `menu` slot (phone) and, if wanted, into the desktop panel header.
 * Needs `ServicesProvider` and a router.
 */
export function BoardMenu({ onFlip, className }: BoardMenuProps) {
  const sound = useSettings((s) => s.sound);
  const updateSettings = useUpdateSettings();
  const navigate = useNavigate();
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <IconButton label={BOARD_DE.moreActions} icon={<EllipsisVertical />} tooltip={false} className={className} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-52 rounded-md bg-surface-2 p-1 shadow-2">
          {onFlip && (
            <DropdownMenu.Item className={itemClass} onSelect={onFlip}>
              <ArrowDownUp aria-hidden="true" className="size-5 text-muted" />
              {BOARD_DE.flip}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.CheckboxItem
            className={itemClass}
            checked={sound}
            onCheckedChange={(checked) => void updateSettings({ sound: checked === true })}
          >
            <span aria-hidden="true" className={cn('inline-flex size-5 items-center justify-center rounded-sm border border-border-strong', sound && 'border-accent bg-accent text-on-accent')}>
              <DropdownMenu.ItemIndicator>
                <Check className="size-4" />
              </DropdownMenu.ItemIndicator>
            </span>
            {BOARD_DE.soundOn}
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Item className={itemClass} onSelect={() => void navigate(paths.settings())}>
            <SettingsIcon aria-hidden="true" className="size-5 text-muted" />
            {BOARD_DE.settings}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

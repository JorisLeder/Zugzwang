import { X } from 'lucide-react';
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { PRIMITIVES_DE } from './strings.de';

/** Dialog root (controlled via `open`/`onOpenChange` or uncontrolled with `DialogTrigger`). */
export const Dialog = RadixDialog.Root;
/** Element that opens the dialog. */
export const DialogTrigger = RadixDialog.Trigger;
/** Element that closes the dialog. */
export const DialogClose = RadixDialog.Close;

/** Props of `DialogContent`. */
export interface DialogContentProps extends Omit<ComponentProps<typeof RadixDialog.Content>, 'title'> {
  /** Dialog title (required for screen readers; hide it visually with `hideTitle`). */
  title: ReactNode;
  hideTitle?: boolean;
  /** Optional description under the title. */
  description?: ReactNode;
  /**
   * `dialog` = centred (max 480 px), `sheet` = bottom sheet, `auto` = sheet below 768 px and dialog above
   * (DESIGN §5.13).
   */
  variant?: 'dialog' | 'sheet' | 'auto';
  /** Show the close (X) button (default true). */
  showClose?: boolean;
  children?: ReactNode;
}

/** Dialog/bottom-sheet content with scrim, focus trap and `Esc` to close. */
export function DialogContent({
  title,
  hideTitle = false,
  description,
  variant = 'auto',
  showClose = true,
  className,
  children,
  ...rest
}: DialogContentProps) {
  const sheet = 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl pb-[calc(16px+env(safe-area-inset-bottom,0px))]';
  const centred = 'left-1/2 top-1/2 w-[calc(100%-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-xl';
  const titleNode = <RadixDialog.Title className="pr-10 text-h2 text-text">{title}</RadixDialog.Title>;
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-60 bg-scrim" />
      <RadixDialog.Content
        className={cn(
          'fixed z-60 flex flex-col gap-4 overflow-y-auto bg-surface p-5 text-text shadow-3 focus:outline-none',
          variant === 'sheet' && sheet,
          variant === 'dialog' && centred,
          variant === 'auto' &&
            'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl pb-[calc(16px+env(safe-area-inset-bottom,0px))] md:inset-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[calc(100%-32px)] md:max-w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:pb-5',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...rest}
      >
        {(variant === 'sheet' || variant === 'auto') && (
          <div aria-hidden="true" className={cn('mx-auto -mt-2 h-1 w-9 rounded-full bg-border-strong', variant === 'auto' && 'md:hidden')} />
        )}
        {hideTitle ? <VisuallyHidden.Root asChild>{titleNode}</VisuallyHidden.Root> : titleNode}
        {description && <RadixDialog.Description className="text-body text-muted">{description}</RadixDialog.Description>}
        {children}
        {showClose && (
          <RadixDialog.Close
            aria-label={PRIMITIVES_DE.close}
            className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          >
            <X aria-hidden="true" className="size-5" />
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/** Bottom sheet (same Radix dialog, always the sheet variant). */
export function SheetContent(props: Omit<DialogContentProps, 'variant'>) {
  return <DialogContent {...props} variant="sheet" />;
}

/** Alias: a sheet is a dialog root. */
export const Sheet = Dialog;
/** Alias of `DialogTrigger` for sheets. */
export const SheetTrigger = DialogTrigger;

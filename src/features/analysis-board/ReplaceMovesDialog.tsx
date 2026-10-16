import { Button, Dialog, DialogContent } from '@/ui/primitives';
import { STRINGS_DE } from './strings.de';

/** Props of `ReplaceMovesDialog`. */
export interface ReplaceMovesDialogProps {
  /** Number of later moves that would be deleted; `null` = closed. */
  count: number | null;
  onAnswer: (replace: boolean) => void;
}

/** Confirmation before a move at an earlier ply deletes the later moves (WP-01 instruction). */
export function ReplaceMovesDialog({ count, onAnswer }: ReplaceMovesDialogProps) {
  return (
    <Dialog
      open={count !== null}
      onOpenChange={(open) => {
        if (!open) onAnswer(false);
      }}
    >
      <DialogContent title={STRINGS_DE.replaceTitle} description={count !== null ? STRINGS_DE.replaceText(count) : undefined} variant="auto">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onAnswer(false)}>
            {STRINGS_DE.replaceCancel}
          </Button>
          <Button onClick={() => onAnswer(true)}>{STRINGS_DE.replaceConfirm}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

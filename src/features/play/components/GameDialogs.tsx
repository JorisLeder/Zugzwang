import { BarChart3, Plus, RotateCcw } from 'lucide-react';
import type { BotProfile } from '@/core/bots';
import type { Color } from '@/core/chess';
import { formatDelta } from '@/i18n';
import { Button, Dialog, DialogClose, DialogContent, RatingDelta } from '@/ui/primitives';
import type { GameOutcome } from '../controller';
import { endMessageDe, userOutcome } from '../logic';
import { STRINGS_DE } from '../strings.de';

/** "Partie wirklich aufgeben?" (DESIGN §9.2). */
export function ResignDialog({ open, onOpenChange, onResign }: { open: boolean; onOpenChange: (open: boolean) => void; onResign: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={STRINGS_DE.resignTitle} variant="dialog" showClose={false}>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{STRINGS_DE.resignCancel}</Button>
          </DialogClose>
          <Button
            variant="danger"
            onClick={() => {
              onOpenChange(false);
              onResign();
            }}
          >
            {STRINGS_DE.resignConfirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Partie läuft auf einem anderen Gerät – hier übernehmen?" (P0-02, DESIGN §3.7). */
export function TakeoverDialog({ open, onTakeOver, onCancel }: { open: boolean; onTakeOver: () => void; onCancel: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent title={STRINGS_DE.takeoverTitle} description={STRINGS_DE.takeoverText} variant="dialog" showClose={false}>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {STRINGS_DE.takeoverCancel}
          </Button>
          <Button onClick={onTakeOver}>{STRINGS_DE.takeoverConfirm}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Move confirmation (`settings.moveConfirmation`). */
export function ConfirmMoveDialog({ san, onAnswer }: { san: string | null; onAnswer: (ok: boolean) => void }) {
  return (
    <Dialog open={san !== null} onOpenChange={(o) => !o && onAnswer(false)}>
      {san !== null && (
        <DialogContent title={STRINGS_DE.confirmTitle} description={STRINGS_DE.confirmText(san)} variant="dialog" showClose={false}>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => onAnswer(false)}>
              {STRINGS_DE.confirmCancel}
            </Button>
            <Button onClick={() => onAnswer(true)}>{STRINGS_DE.confirmPlay}</Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/** Props of the result block (dialog and panel). */
export interface ResultProps {
  outcome: GameOutcome;
  userColor: Color;
  bot: BotProfile;
  rated: boolean;
  onAnalyse: () => void;
  onRematch: () => void;
  onNewGame: () => void;
}

function resultTitle(outcome: GameOutcome, userColor: Color): string {
  const o = userOutcome(outcome.result, userColor);
  return o === 'win' ? STRINGS_DE.resultTitleWin : o === 'loss' ? STRINGS_DE.resultTitleLoss : STRINGS_DE.resultTitleDraw;
}

/** Reason, rating change and the three actions (shared by dialog and panel). */
export function ResultBody({ outcome, userColor, bot, rated, onAnalyse, onRematch, onNewGame }: ResultProps) {
  const delta = outcome.ratingAfter !== null && outcome.ratingBefore !== null ? outcome.ratingAfter - outcome.ratingBefore : null;
  return (
    <div className="flex flex-col gap-4">
      <p data-testid="game-result-reason" className="text-body text-text">
        {endMessageDe(outcome.reason, outcome.result, userColor, bot.name, outcome.claimant)}
      </p>
      {rated && outcome.ratingAfter !== null ? (
        <p className="flex items-center gap-2 text-body text-text" aria-label={`${STRINGS_DE.ratingLine(Math.round(outcome.ratingAfter))} (${formatDelta(delta ?? 0)})`}>
          {STRINGS_DE.ratingLine(Math.round(outcome.ratingAfter))}
          {delta !== null && <RatingDelta value={delta} />}
        </p>
      ) : (
        <p className="text-body-sm text-muted">{STRINGS_DE.unratedLine}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button icon={<BarChart3 />} onClick={onAnalyse}>
          {STRINGS_DE.analyse}
        </Button>
        <Button variant="secondary" icon={<RotateCcw />} onClick={onRematch}>
          {STRINGS_DE.rematch}
        </Button>
        <Button variant="secondary" icon={<Plus />} onClick={onNewGame}>
          {STRINGS_DE.newGame}
        </Button>
      </div>
    </div>
  );
}

/** Result dialog shown when the game ends in this session. */
export function ResultDialog({ open, onOpenChange, ...props }: ResultProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={resultTitle(props.outcome, props.userColor)}>
        <ResultBody {...props} />
      </DialogContent>
    </Dialog>
  );
}


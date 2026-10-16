import type { BotProfile } from '@/core/bots';
import type { AssistanceLevel } from '@/core/games';
import { Dialog, DialogContent } from '@/ui/primitives';
import type { ColorChoice } from '../logic';
import { STRINGS_DE } from '../strings.de';
import { BotAvatar } from './BotAvatar';
import { SetupForm, type SetupChoice } from './SetupForm';

/** Props of `SetupDialog`. */
export interface SetupDialogProps {
  bot: BotProfile | null;
  initialLevel: AssistanceLevel;
  initialColor?: ColorChoice;
  onClose: () => void;
  onStart: (choice: SetupChoice) => Promise<void>;
}

/** Setup sheet after choosing a bot (DESIGN §3.6; bottom sheet on phones, dialog on larger screens). */
export function SetupDialog({ bot, initialLevel, initialColor = 'w', onClose, onStart }: SetupDialogProps) {
  return (
    <Dialog open={bot !== null} onOpenChange={(open) => !open && onClose()}>
      {bot && (
        <DialogContent title={STRINGS_DE.setupTitle(bot.name)} description={STRINGS_DE.setupDescription(bot.elo, bot.styleLabelDe)}>
          <div className="flex items-start gap-3">
            <BotAvatar bot={bot} size="md" />
            <p className="text-body text-muted">{bot.descriptionDe}</p>
          </div>
          <SetupForm bots={[bot]} initialBotId={bot.id} initialLevel={initialLevel} initialColor={initialColor} onStart={onStart} />
        </DialogContent>
      )}
    </Dialog>
  );
}

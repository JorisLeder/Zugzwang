/**
 * Einstellungen – minimal WP-00 version (Design, Brettdesign, Notation) so the settings store can be exercised.
 * Owned by WP-09 from wave 2 (full list of DESIGN §3.6 without "Einfache Ansicht", D-39).
 */
import { useSettings, useUpdateSettings } from '@/app/services';
import type { Settings } from '@/core/profile';
import { Page } from '@/ui/layout/Page';
import { Card, SegmentedControl } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';

/** Settings page. */
export function Component() {
  const settings = useSettings();
  const update = useUpdateSettings();
  return (
    <Page title={STRINGS_DE.title} subtitle={STRINGS_DE.subtitle}>
      <Card className="flex max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-h3">{STRINGS_DE.theme}</h2>
          <SegmentedControl<Settings['theme']>
            label={STRINGS_DE.theme}
            value={settings.theme}
            onValueChange={(theme) => void update({ theme })}
            options={[
              { value: 'dark', label: STRINGS_DE.themeDark },
              { value: 'light', label: STRINGS_DE.themeLight },
              { value: 'system', label: STRINGS_DE.themeSystem },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-h3">{STRINGS_DE.board}</h2>
          <SegmentedControl<Settings['boardTheme']>
            label={STRINGS_DE.board}
            value={settings.boardTheme}
            onValueChange={(boardTheme) => void update({ boardTheme })}
            options={[
              { value: 'moos', label: STRINGS_DE.boardMoos },
              { value: 'holz', label: STRINGS_DE.boardHolz },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-h3">{STRINGS_DE.notation}</h2>
          <SegmentedControl<Settings['notation']>
            label={STRINGS_DE.notation}
            value={settings.notation}
            onValueChange={(notation) => void update({ notation })}
            options={[
              { value: 'de', label: STRINGS_DE.notationDe },
              { value: 'en', label: STRINGS_DE.notationEn },
            ]}
          />
        </div>
      </Card>
    </Page>
  );
}

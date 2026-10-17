/**
 * German strings of the sync status, the banners and the in-app help "Speichern und Synchronisieren" (D-35).
 * The help text is the user-facing setup documentation of local vs cloud mode (keep the README section in line).
 */
import type { SyncState } from '@/core/storage';

/** Label and description per sync status. */
export const SYNC_STATUS_DE: Record<SyncState['status'], { label: string; description: string }> = {
  'local-only': { label: 'Lokal', description: 'Lokaler Modus – Fortschritt nur auf diesem Gerät' },
  synced: { label: 'Gespeichert', description: 'Alles ist gespeichert und synchronisiert.' },
  pending: { label: 'Speichern …', description: 'Dein Fortschritt wird gerade gespeichert.' },
  offline: {
    label: 'Offline',
    description: 'Du bist offline. Dein Fortschritt bleibt auf diesem Gerät und wird übertragen, sobald du wieder online bist.',
  },
  error: {
    label: 'Nicht synchronisiert',
    description: 'Das Speichern auf dem Server hat nicht geklappt. Es wird automatisch erneut versucht – nichts geht verloren.',
  },
};

/** One section of the help dialog. */
export interface HelpSection {
  title: string;
  paragraphs: string[];
}

export const SYNC_DE = {
  /** Accessible name of the status button. */
  statusButton: (label: string) => `Speicherstatus: ${label}. Hilfe zum Speichern öffnen`,
  pendingCount: (n: number) => (n === 1 ? '1 Änderung wartet auf die Übertragung.' : `${n} Änderungen warten auf die Übertragung.`),
  lastSynced: (time: string) => `Zuletzt synchronisiert um ${time} Uhr.`,
  localBanner: 'Lokaler Modus – Fortschritt nur auf diesem Gerät',
  errorBanner: 'Nicht synchronisiert – es wird automatisch erneut versucht. Nichts geht verloren.',
  learnMore: 'Mehr erfahren',
  retryNow: 'Jetzt erneut versuchen',
  dismissBanner: 'Hinweis schließen',
  helpTitle: 'Speichern und Synchronisieren',
  helpCurrentMode: { local: 'Diese App läuft im lokalen Modus.', cloud: 'Diese App läuft im Cloud-Modus.' },
  close: 'Schließen',
  help: [
    {
      title: 'Lokaler Modus',
      paragraphs: [
        'Ohne Cloud-Sync speichert Zugzwang deinen Fortschritt nur im Browser auf diesem Gerät. Du brauchst dafür kein Konto und keine Anmeldung.',
        'Andere Geräte sehen diesen Fortschritt nicht. Wenn du die Browserdaten löschst, ist er weg – sichere ihn bei Bedarf mit „Daten exportieren“ in den Einstellungen.',
      ],
    },
    {
      title: 'Cloud-Modus',
      paragraphs: [
        'Mit Cloud-Sync meldest du dich per E-Mail-Link oder mit Google an und bleibst 30 Tage angemeldet.',
        'Jede Aktion erscheint sofort und ist spätestens eine Sekunde später auf dem Server. Andere angemeldete Geräte zeigen den neuen Stand nach höchstens zwei Sekunden – ohne Neuladen.',
      ],
    },
    {
      title: 'Was synchronisiert wird',
      paragraphs: [
        'Profil und Einstellungen, Ratings, Puzzle-Versuche, Partien mit allen Zügen, Analysen, Lektionsfortschritt, Tagesaktivität und Streak, Motiv-Statistik, Wiederholungen und deine Bewertungen von Erklärungen.',
        'Die Puzzle-Sammlung, die Bots und die Lektionen selbst gehören zur App und werden nicht synchronisiert.',
      ],
    },
    {
      title: 'Offline und Konflikte',
      paragraphs: [
        'Offline trainierst du einfach weiter: Alles kommt in eine Warteschlange und wird beim Wiederverbinden genau einmal übertragen. Klappt ein Speichern nicht, siehst du „Nicht synchronisiert“ und es wird automatisch erneut versucht.',
        'Ratings, Streak und Statistik berechnet der Server; bis zur Bestätigung siehst du einen vorläufigen Wert. Versuche und Züge werden nur angehängt, beim Lektionsfortschritt gewinnt der weiteste Stand, bei Einstellungen die letzte Änderung. Läuft eine Partie auf einem anderen Gerät, kannst du sie hier übernehmen.',
      ],
    },
    {
      title: 'Cloud-Sync einrichten',
      paragraphs: [
        'Cloud-Sync braucht ein eigenes Supabase-Projekt (Region Frankfurt). Trage beim Build VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY ein – nur diese beiden öffentlichen Werte, nie einen geheimen Server-Schlüssel.',
        'Aktiviere in Supabase die Anmeldung per E-Mail und Google, trage als Weiterleitungs-URL deine Adresse mit /auth/callback ein und begrenze die Sitzungsdauer auf 30 Tage. Ein Gerät, das vorher lokal lief, übernimmt seinen Fortschritt bei der ersten Anmeldung einmalig in dein Konto.',
      ],
    },
  ] satisfies HelpSection[],
} as const;

/**
 * Service wiring (D-03, BACKLOG 2.6): builds `AppServices` once from the factories at fixed module paths and provides
 * them via React context. Owners replace the factory implementations; this file stays frozen (WP-00).
 *
 * - `useServices()` – the service bundle.
 * - `useSettings()` / `useSettings(selector)` – current settings (zustand store, loaded from and saved through
 *   `data.repos.profile`); `useUpdateSettings()` – patch + persist.
 * - `SettingsEffects` – applies theme (`data-theme`), board theme (`data-board`) and motion (`data-motion`) to <html>.
 */
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { createAnalysisService } from '@/analysis';
import { BOT_ROSTER, createBotEngine } from '@/bots';
import type { Settings } from '@/core/profile';
import { DEFAULT_SETTINGS } from '@/core/profile';
import type { AppConfig, AppServices } from '@/core/services';
import { createDataServices } from '@/data';
import { createEngineService } from '@/engine';
import { createExplanationService } from '@/explain';

/** Builds all services for a configuration. */
export function createAppServices(config: AppConfig): AppServices {
  const data = createDataServices(config);
  const engines = { play: createEngineService('play', config), analysis: createEngineService('analysis', config) };
  return {
    config,
    data,
    engines,
    analysis: createAnalysisService(engines.analysis, config),
    bots: createBotEngine(engines.play, config),
    botRoster: BOT_ROSTER,
    explain: createExplanationService(config, data),
  };
}

const ServicesContext = createContext<AppServices | null>(null);

/** Provides the services to the tree (tests can pass their own bundle built from fakes). */
export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return (
    <ServicesContext.Provider value={services}>
      <SettingsEffects services={services} />
      {children}
    </ServicesContext.Provider>
  );
}

/** The service bundle. Throws outside `ServicesProvider`. */
export function useServices(): AppServices {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices() must be used inside <ServicesProvider>');
  return s;
}

/** Settings store state (UI state only; the source of truth is the profile). */
export interface SettingsState {
  settings: Settings;
  /** True once the stored settings were loaded. */
  hydrated: boolean;
  setSettings: (settings: Settings) => void;
}

/** Zustand store of the current settings. Prefer `useSettings()`. */
export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  setSettings: (settings) => set({ settings, hydrated: true }),
}));

/** Current settings (outside a provider: the defaults). */
export function useSettings(): Settings;
/** Selected part of the settings (re-renders only when it changes). */
export function useSettings<T>(selector: (s: Settings) => T): T;
export function useSettings<T>(selector?: (s: Settings) => T): Settings | T {
  return useSettingsStore((state) => (selector ? selector(state.settings) : state.settings));
}

/** Returns `update(patch)`: applies the patch immediately and persists it via `data.repos.profile.updateSettings`. */
export function useUpdateSettings(): (patch: Partial<Settings>) => Promise<void> {
  const { data } = useServices();
  return useCallback(
    async (patch: Partial<Settings>) => {
      const store = useSettingsStore.getState();
      store.setSettings({ ...store.settings, ...patch });
      const saved = await data.repos.profile.updateSettings(patch);
      useSettingsStore.getState().setSettings(saved);
    },
    [data],
  );
}

function resolveTheme(theme: Settings['theme']): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Loads settings from the profile and mirrors them onto <html>. Rendered by `ServicesProvider`. */
function SettingsEffects({ services }: { services: AppServices }) {
  const settings = useSettings();

  useEffect(() => {
    return services.data.repos.profile.observe().subscribe((profile) => {
      if (profile) useSettingsStore.getState().setSettings(profile.settings);
    });
  }, [services]);

  useEffect(() => {
    const root = document.documentElement;
    const theme = resolveTheme(settings.theme);
    root.dataset.theme = theme;
    root.dataset.board = settings.boardTheme;
    if (!settings.animations || services.config.e2e) root.dataset.motion = 'off';
    else delete root.dataset.motion;
    try {
      localStorage.setItem('zz-theme', theme);
    } catch {
      // Storage may be unavailable (private mode) – the theme still applies for this session.
    }
  }, [settings.theme, settings.boardTheme, settings.animations, services.config.e2e]);

  useEffect(() => {
    if (settings.theme !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      document.documentElement.dataset.theme = mq.matches ? 'light' : 'dark';
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.theme]);

  return null;
}

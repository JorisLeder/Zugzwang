/**
 * Communication between page layouts and the app shell (D-40): while a `BoardLayout` is mounted, the phone tab bar
 * is replaced by the board screen's action bar.
 */
import { createContext, useContext, useEffect } from 'react';

/** Shell controls exposed to layouts. */
export interface ShellControls {
  /** Registers an active board screen; returns the unregister function. */
  registerBoardScreen: () => () => void;
}

/** Provided by the app shell; `null` outside (tests, bare pages). */
export const ShellContext = createContext<ShellControls | null>(null);

/** Marks the current screen as an active board screen while mounted. */
export function useRegisterBoardScreen(active = true): void {
  const shell = useContext(ShellContext);
  useEffect(() => {
    if (!shell || !active) return undefined;
    return shell.registerBoardScreen();
  }, [shell, active]);
}

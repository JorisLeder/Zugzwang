/** German status texts of the browser engine (shown by "Engine lädt …" / error UIs of the consuming features). */
export const ENGINE_STRINGS_DE = {
  /** No Web Worker available (old browser, jsdom, Node) or the worker could not be created. */
  unavailable: 'Engine nicht verfügbar',
  /** The worker started but the engine files could not be loaded or the engine crashed. */
  loadFailed: 'Engine konnte nicht geladen werden',
  /** The engine did not answer the UCI handshake in time. */
  timeout: 'Engine antwortet nicht',
} as const;

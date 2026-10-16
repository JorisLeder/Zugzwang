/**
 * `@/lib/uci` – UCI parser, White-POV score conversion (D-08) and the generic `EngineService` over a transport.
 * Browser-safe. The Node engine lives in `@/lib/uci/node` (import it only from tests and scripts). Frozen (WP-00).
 */
export { infoToEngineLine, parseUciLine, toWhitePov, type RawScore, type UciInfo, type UciMessage } from './parser';
export { createUciEngineService, type UciEngineOptions } from './service';

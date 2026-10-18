/**
 * `explain` edge function (PRD P0-11, NFR Sicherheit): German 1–3 sentence explanation of engine-confirmed facts by
 * Claude. The client always has the rule-based text and falls back to it on every `{ ok: false }` answer.
 *
 * Flow: CORS/POST → caller from the bearer token (401) → body checked with `explainRequestSchema` (400) → API key
 * from the function's secret env `ANTHROPIC_API_KEY` (503 when unset) → daily quota of 200 per user (429) → one
 * Messages API call (`claude-opus-5-5`, effort `low`, server-side `fallbacks: "default"`; no prefill, thinking stays
 * adaptive) → `stop_reason` checked (`refusal` → `refused`, anything but `end_turn` → `invalid`) → the text, with
 * moves written as `[[SAN]]` (D-19), validated like on the client (`validateExplanationSegments`: only fact moves,
 * no unmarked moves, 1–3 sentences) → `{ ok: true, segments, model }`.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ExplainRequest, ExplainResponse, ExplanationFacts } from '@/core/explain';
import { MOTIF_LABELS_DE } from '@/core/explain';
import { explainRequestSchema } from '@/core/schemas';
import { pieceNoun, sideName } from '@/explain/grammar';
import { replayFactLines } from '@/explain/lines';
import { MAX_EXPLANATION_CHARS, validateExplanationSegments } from '@/explain/validate';
import { bearerToken, jsonResponse, postHandler, readJsonBody, type RequestHandler } from '../_shared/http.ts';
import type { AuthPort, QuotaPort } from '../_shared/supabase.ts';

/** Model of the explanations. */
export const EXPLAIN_MODEL = 'claude-opus-5-5';

/** Explanations per user and day (PRD NFR Sicherheit). */
export const EXPLAIN_DAILY_LIMIT = 200;

/** Timeout of the Claude request: the app waits 8 s (`LLM_TIMEOUT_MS`), so a later answer would be wasted. */
export const CLAUDE_TIMEOUT_MS = 7_000;

/** Output cap (thinking included) – the answer is 1–3 sentences; a longer turn would miss the app's timeout anyway. */
export const EXPLAIN_MAX_TOKENS = 4_096;

/** Beta header of the server-side refusal fallback in its `"default"` form. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Name of the secret that holds the Anthropic API key (set with `supabase secrets set`). */
export const API_KEY_ENV = 'ANTHROPIC_API_KEY';

/** Largest accepted request body (characters). */
export const MAX_BODY_CHARS = 64_000;

type MessageParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;

/** The part of the SDK client the handler uses (`new Anthropic(…).beta.messages`). */
export interface ClaudeMessages {
  create(params: MessageParams, options?: Anthropic.RequestOptions): Promise<Message>;
}

/** Dependencies (`index.ts` wires the real ones; tests pass fakes). */
export interface ExplainDeps {
  /** The function's environment (`Deno.env.get`). The API key is read from here only. */
  env(name: string): string | undefined;
  auth: AuthPort;
  quota: QuotaPort;
  /** Creates the Messages API client for the key. */
  claude(apiKey: string): ClaudeMessages;
}

type Failure = Extract<ExplainResponse, { ok: false }>['error'];

const failure = (error: Failure, status: number) => jsonResponse({ ok: false, error } satisfies ExplainResponse, status);

/** Stable instructions (identical for every request, so they can be cached). */
export const SYSTEM_PROMPT = [
  'Du schreibst kurze Erklärungen für Zugzwang, eine Schach-Lern-App für Anfängerinnen und Anfänger (Kinder ab 10 und Erwachsene).',
  'Die Fakten stammen von einer Schach-Engine und sind geprüft. Erkläre mit ihnen, warum etwas passiert – nicht nur, was passiert.',
  '',
  'Regeln:',
  `1. Schreib auf Deutsch, 1 bis 3 kurze Sätze, zusammen höchstens ${MAX_EXPLANATION_CHARS - 80} Zeichen. Kein Markdown, keine Liste, keine Überschrift.`,
  '2. Verwende deutsche Schachbegriffe: König, Dame, Turm, Läufer, Springer, Bauer, Gabel, Fesselung, Spieß, Abzugsangriff, Grundreihe, Patt.',
  '3. Benutze nur die Fakten. Erfinde keine Züge, Varianten, Figuren oder Motive. Nenne keine Engine-Zahlen (Bewertungen, Prozente, Bauerneinheiten).',
  '4. Nenne Züge nur aus der Liste „Erlaubte Züge“. Schreib jeden Zug genau wie dort in englischer Notation in doppelten eckigen Klammern, z. B. [[Nf3]], [[exd5]] oder [[O-O]]. Schreib nie einen Zug ohne Klammern und nie in deutscher Notation wie Sf3 oder Lxc4 – die App zeigt die Züge selbst in der Notation der Lernenden an.',
  '5. Felder nennst du ohne Klammern, z. B. „auf e4“ oder „den Bauern f7“.',
  '6. Antworte nur mit dem Erklärungstext, ohne Einleitung und ohne Anführungszeichen.',
].join('\n');

const KIND_TASK: Record<ExplanationFacts['kind'], string> = {
  mistake:
    'Partieanalyse: Der gespielte Zug war ein Fehler. Erkläre in der dritten Person mit „Weiß“ und „Schwarz“ (es kann der Zug der lernenden Person oder des Gegners sein), was der Zug übersieht und was danach passiert; danach, warum der beste Zug besser ist.',
  coach_warning:
    'Coach-Warnung: Die lernende Person (sprich sie mit „du“ an) überlegt, den angegebenen Zug zu spielen. Warne freundlich und erkläre, was danach passiert. Verrate den besseren Zug nicht – sie soll selbst noch einmal nachdenken.',
  threat:
    'Drohung: Erkläre der lernenden Person (mit „du“), was die Gegnerseite droht, wenn sie jetzt nicht aufpasst.',
  praise: 'Lob: Der gespielte Zug der lernenden Person (mit „du“) war stark. Lobe ihn kurz und erkläre, warum er gut ist.',
  puzzle: 'Puzzle: Erkläre der lernenden Person (mit „du“), warum die Lösung funktioniert.',
};

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** The user turn: the facts as German lines plus the list of moves the text may name. */
export function factsPrompt(request: ExplainRequest): string {
  const { facts } = request;
  const lines = replayFactLines(facts);
  // A coach warning must not reveal the better move (the learner thinks again), so its best line is left out.
  const played = lines.played ? [lines.played] : [];
  const named = facts.kind === 'coach_warning' ? [...played, ...lines.refutation] : [...played, ...lines.best, ...lines.refutation];
  const allowed = [...new Set(named.map((m) => m.san))];
  const out = [`Aufgabe: ${KIND_TASK[facts.kind]}`, '', 'Fakten:', `- Am Zug: ${sideName(facts.mover)}`, `- Stellung (FEN): ${facts.fenBefore}`];
  if (lines.played) out.push(`- Gespielter Zug: ${lines.played.san}`);
  if (facts.kind === 'puzzle') {
    if (lines.best.length > 0) out.push(`- Lösung: ${lines.best.map((m) => m.san).join(' ')}`);
  } else if (facts.kind !== 'coach_warning' && lines.best.length > 0) {
    out.push(`- Bester Zug: ${lines.best[0]!.san}`, `- Beste Fortsetzung: ${lines.best.map((m) => m.san).join(' ')}`);
  }
  if (lines.refutation.length > 0) {
    const label = facts.kind === 'threat' ? 'Drohung der Gegnerseite' : 'Antwort der Gegnerseite und Fortsetzung';
    out.push(`- ${label}: ${lines.refutation.map((m) => m.san).join(' ')}`);
  }
  if (facts.expectedPointsLoss !== undefined) out.push(`- Verschlechterung (nur zur Einordnung, nicht nennen): ${pct(facts.expectedPointsLoss)}`);
  if (facts.materialSwing !== undefined && facts.materialSwing !== 0) {
    out.push(`- Material für ${sideName(facts.mover)} danach: ${facts.materialSwing > 0 ? '+' : ''}${facts.materialSwing} (Bauer = 1, Springer/Läufer = 3, Turm = 5, Dame = 9)`);
  }
  if (facts.mateIn !== undefined && facts.mateIn !== 0) {
    const mater = facts.mateIn > 0 ? facts.mover : facts.mover === 'w' ? 'b' : 'w';
    out.push(`- Erzwungenes Matt in ${Math.abs(facts.mateIn)} für ${sideName(mater)}`);
  }
  for (const m of facts.motifs) {
    const pieces = m.pieces.map((p) => `${pieceNoun(p.piece, 'nom')} (${sideName(p.color)}) auf ${p.square}`).join(', ');
    out.push(`- Motiv: ${MOTIF_LABELS_DE[m.id]}${m.squares.length ? ` (Felder ${m.squares.join(', ')})` : ''}${pieces ? `; Figuren: ${pieces}` : ''}`);
  }
  // Theme keys are free strings in the contract: only plain keys reach the prompt.
  const themes = (facts.themes ?? []).filter((t) => /^[A-Za-z0-9_-]{1,40}$/.test(t));
  if (themes.length > 0) out.push(`- Puzzle-Themen: ${themes.join(', ')}`);
  out.push('', `Erlaubte Züge: ${allowed.length > 0 ? allowed.join(', ') : '(keine – nenne keinen Zug)'}`);
  return out.join('\n');
}

/** The Messages API request for one explanation. */
export function buildMessageParams(request: ExplainRequest): MessageParams {
  return {
    model: EXPLAIN_MODEL,
    max_tokens: EXPLAIN_MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: factsPrompt(request) }],
  };
}

/** The answer for a Claude response (see the file header). */
export function explanationFromMessage(message: Message, facts: ExplanationFacts): ExplainResponse {
  if (message.stop_reason === 'refusal') {
    console.warn(`explain: refused (${message.stop_details?.category ?? 'no category'}) by ${message.model}`);
    return { ok: false, error: 'refused' };
  }
  if (message.stop_reason !== 'end_turn') {
    console.warn(`explain: unusable stop_reason ${message.stop_reason ?? 'null'}`);
    return { ok: false, error: 'invalid' };
  }
  const text = message.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const valid = validateExplanationSegments([{ type: 'text', text }], facts);
  if (!valid.ok) {
    console.warn(`explain: model text rejected (${valid.reason})`);
    return { ok: false, error: 'invalid' };
  }
  return { ok: true, segments: valid.segments, model: message.model };
}

/** Failure answer for an error of the Claude request (typed SDK errors, most specific first). */
function claudeErrorResponse(e: unknown): Response {
  if (e instanceof Anthropic.RateLimitError) {
    console.warn('explain: Claude API rate limit');
    return failure('rate_limited', 429);
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    console.warn('explain: Claude API timeout');
    return failure('unavailable', 504);
  }
  if (e instanceof Anthropic.APIConnectionError) {
    console.warn('explain: Claude API not reachable');
    return failure('unavailable', 503);
  }
  if (e instanceof Anthropic.InternalServerError) {
    console.warn(`explain: Claude API error ${e.status}`);
    return failure('unavailable', 503);
  }
  if (e instanceof Anthropic.APIError) {
    // 400/401/403/404: configuration or request problem – nothing the user can change.
    console.error(`explain: Claude API rejected the request (${e.status ?? 'no status'}): ${e.message}`);
    return failure('unavailable', 502);
  }
  throw e;
}

/** Creates the request handler. */
export function createExplainHandler(deps: ExplainDeps): RequestHandler {
  return postHandler('explain', { methodNotAllowed: { ok: false, error: 'invalid' }, internalError: { ok: false, error: 'unavailable' } }, async (req) => {
    const token = bearerToken(req);
    const userId = token ? await deps.auth.userId(token) : null;
    if (!userId) return failure('unavailable', 401);

    const body = await readJsonBody(req, MAX_BODY_CHARS);
    const parsed = body.ok ? explainRequestSchema.safeParse(body.value) : null;
    if (!parsed?.success) return failure('invalid', body.ok || body.reason === 'not_json' ? 400 : 413);
    const request: ExplainRequest = parsed.data;

    const apiKey = deps.env(API_KEY_ENV)?.trim();
    if (!apiKey) {
      console.error(`explain: secret ${API_KEY_ENV} is not set`);
      return failure('unavailable', 503);
    }
    if (!(await deps.quota.consume(userId, EXPLAIN_DAILY_LIMIT))) return failure('rate_limited', 429);

    let message: Message;
    try {
      message = await deps.claude(apiKey).create(buildMessageParams(request), { timeout: CLAUDE_TIMEOUT_MS, maxRetries: 0 });
    } catch (e) {
      return claudeErrorResponse(e);
    }
    return jsonResponse(explanationFromMessage(message, request.facts), 200);
  });
}

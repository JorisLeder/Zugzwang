import { FileUp, Upload } from 'lucide-react';
import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { parsePgnWithDiagnostics, PGN_LIMITS, type PgnDiagnostic, type PgnGame } from '@/pgn';
import { Page } from '@/ui/layout';
import { Button, Card, CardMeta } from '@/ui/primitives';
import { gameSummary, importPgnGame } from '../importGame';
import { STRINGS_DE } from '../strings.de';

type Problem = { kind: 'parse'; diagnostic: PgnDiagnostic } | { kind: 'message'; text: string };

/**
 * PGN importieren (`/analysis/import`, P0-15): paste or upload a PGN; invalid PGNs show a German message with the line
 * ("Zeile 12: Ungültiger Zug „Nf9“ (Zug 23, Weiß) …"); several games → selection list; the chosen game is stored
 * (source `pgn`, external id – duplicates open the existing game) and its analysis opens (it starts automatically).
 */
export function Component() {
  const services = useServices();
  const navigate = useNavigate();
  services.data.activity.useTracking('analysis');
  const textareaId = useId();
  const fileId = useId();
  const errorId = useId();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [games, setGames] = useState<PgnGame[] | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (game: PgnGame) => {
    setBusy(true);
    setProblem(null);
    const outcome = await importPgnGame(services, game);
    setBusy(false);
    if (!outcome.ok) {
      setProblem({ kind: 'message', text: outcome.errorDe });
      return;
    }
    await navigate(paths.analysisGame(outcome.gameId), { state: { duplicate: outcome.duplicate } });
  };

  const parse = async (pgn: string) => {
    setGames(null);
    const result = parsePgnWithDiagnostics(pgn);
    if (!result.ok) {
      setProblem({ kind: 'parse', diagnostic: result.error });
      return;
    }
    setProblem(null);
    if (result.games.length === 1) await open(result.games[0]!);
    else setGames(result.games);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void parse(text);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > PGN_LIMITS.maxChars * 4) {
      setProblem({ kind: 'message', text: STRINGS_DE.fileTooLarge });
      return;
    }
    let content: string;
    try {
      content = await file.text();
    } catch {
      setProblem({ kind: 'message', text: STRINGS_DE.fileReadError });
      return;
    }
    setText(content);
    await parse(content);
  };

  const importAll = async (list: PgnGame[]) => {
    setBusy(true);
    setProblem(null);
    for (const g of list) {
      const outcome = await importPgnGame(services, g);
      if (!outcome.ok) {
        setBusy(false);
        setProblem({ kind: 'message', text: outcome.errorDe });
        return;
      }
    }
    setBusy(false);
    await navigate(paths.analysis());
  };

  const problemText = problem ? (problem.kind === 'parse' ? problem.diagnostic.messageDe : problem.text) : null;

  return (
    <Page title={STRINGS_DE.analysisImport} subtitle={STRINGS_DE.subtitle}>
      <div className="flex max-w-3xl flex-col gap-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-busy={busy}>
          <label htmlFor={textareaId} className="text-body font-medium text-text">
            {STRINGS_DE.pasteLabel}
          </label>
          <textarea
            id={textareaId}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (problem) setProblem(null);
            }}
            placeholder={STRINGS_DE.pastePlaceholder}
            rows={12}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={problem?.kind === 'parse' ? true : undefined}
            aria-describedby={problemText ? errorId : undefined}
            className="min-h-48 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-body-sm text-text placeholder:text-disabled aria-invalid:border-danger"
            data-testid="pgn-input"
          />
          {problemText && (
            <div id={errorId} role="alert" data-testid="pgn-error" className="rounded-md bg-danger-subtle p-3 text-body text-danger-text">
              <p className="font-semibold">{STRINGS_DE.errorTitle}</p>
              <p>{problemText}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" icon={<FileUp />} loading={busy} disabled={busy || text.trim().length === 0}>
              {busy ? STRINGS_DE.importing : STRINGS_DE.submit}
            </Button>
            <label
              htmlFor={fileId}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-surface-3 px-4 text-body font-medium text-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--zz-focus)]"
            >
              <Upload aria-hidden="true" className="size-5" />
              {STRINGS_DE.uploadLabel}
              <input id={fileId} type="file" accept=".pgn,application/x-chess-pgn,text/plain" className="sr-only" onChange={(e) => void onFile(e)} data-testid="pgn-file" />
            </label>
            <span className="text-body-sm text-muted">{STRINGS_DE.uploadHint}</span>
          </div>
        </form>

        {games && games.length > 1 && (
          <section aria-labelledby="pgn-choose" className="flex flex-col gap-3">
            <div>
              <h2 id="pgn-choose" className="text-h2 text-text">
                {STRINGS_DE.chooseTitle(games.length)}
              </h2>
              <p className="text-body text-muted">{STRINGS_DE.chooseText}</p>
            </div>
            <ul className="flex flex-col gap-2" aria-label={STRINGS_DE.chooseListLabel} data-testid="pgn-games">
              {games.map((g) => {
                const s = gameSummary(g);
                return (
                  <li key={g.index}>
                    <Card className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-h3 text-text">{s.title}</p>
                        <CardMeta>{s.meta}</CardMeta>
                      </div>
                      <Button size="sm" disabled={busy} onClick={() => void open(g)} aria-label={STRINGS_DE.analyseThisLabel(s.title)}>
                        {STRINGS_DE.analyseThis}
                      </Button>
                    </Card>
                  </li>
                );
              })}
            </ul>
            <div>
              <Button variant="secondary" disabled={busy} onClick={() => void importAll(games)}>
                {STRINGS_DE.importAll}
              </Button>
            </div>
          </section>
        )}

        <Button variant="link" asChild className="self-start">
          <Link to={paths.analysis()}>{STRINGS_DE.backToHub}</Link>
        </Button>
      </div>
    </Page>
  );
}

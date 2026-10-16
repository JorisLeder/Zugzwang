import { Copy, Download } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/ui/primitives';
import { exportFen, exportPgn, loadInput, type AnalysisLine, type LoadResult } from './analysisLine';
import { STRINGS_DE } from './strings.de';

/** Props of `ImportExport`. */
export interface ImportExportProps {
  line: AnalysisLine;
  /** Called with a successfully loaded position/game. */
  onLoad: (result: Extract<LoadResult, { ok: true }>) => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadText(text: string, fileName: string): boolean {
  try {
    if (typeof URL.createObjectURL !== 'function') return false;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

/** FEN/PGN export (copy, download) and import (FEN or PGN, German errors) – DESIGN §3.5 "FEN/PGN load/export". */
export function ImportExport({ line, onLoad }: ImportExportProps) {
  const id = useId();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState('');
  const fen = exportFen(line);

  const load = () => {
    const result = loadInput(input);
    if (!result.ok) {
      setError(result.errorDe);
      setInfo('');
      return;
    }
    setError(null);
    setInput('');
    setInfo(STRINGS_DE.importDone);
    onLoad(result);
  };

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h2 id={`${id}-h`} className="text-h3 text-text">
        {STRINGS_DE.ioHeading}
      </h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-fen`} className="text-body-sm text-muted">
          {STRINGS_DE.fenLabel}
        </label>
        <input
          id={`${id}-fen`}
          readOnly
          value={fen}
          data-testid="fen-output"
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-full min-w-0 rounded-md border border-border-strong bg-surface-2 px-3 font-mono text-body-sm text-text"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Copy />} onClick={async () => setInfo((await copyText(fen)) ? STRINGS_DE.fenCopied : STRINGS_DE.copyFailed)}>
          {STRINGS_DE.copyFen}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Copy />}
          onClick={async () => setInfo((await copyText(exportPgn(line))) ? STRINGS_DE.pgnCopied : STRINGS_DE.copyFailed)}
        >
          {STRINGS_DE.copyPgn}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Download />}
          onClick={() => setInfo(downloadText(exportPgn(line), STRINGS_DE.pgnFileName) ? STRINGS_DE.pgnDownloaded : STRINGS_DE.copyFailed)}
        >
          {STRINGS_DE.downloadPgn}
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-in`} className="text-body-sm text-muted">
          {STRINGS_DE.importLabel}
        </label>
        <textarea
          id={`${id}-in`}
          value={input}
          rows={3}
          placeholder={STRINGS_DE.importPlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => setInput(e.target.value)}
          className="w-full min-w-0 resize-y rounded-md border border-border-strong bg-surface-2 px-3 py-2 font-mono text-body-sm text-text placeholder:text-muted"
        />
        {error && (
          <p id={`${id}-err`} role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}
        <div>
          <Button variant="secondary" onClick={load}>
            {STRINGS_DE.importButton}
          </Button>
        </div>
      </div>
      <p role="status" className="min-h-5 text-body-sm text-muted">
        {info}
      </p>
    </section>
  );
}

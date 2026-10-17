/**
 * Horizontal bar rows (one magnitude series, 0–100 %): every row carries its label and value as text, the bar itself
 * is a decorative SVG mark (rounded end, track behind it). A table view is available as fallback.
 */
import { useId, useState, type ReactNode } from 'react';
import { STRINGS_DE } from '../strings.de';

/** One bar. */
export interface BarRow {
  key: string;
  label: string;
  /** 0–100, `null` = no data (no bar). */
  value: number | null;
  /** Value text shown next to the bar. */
  valueText: string;
  /** Extra text (e.g. "10 Versuche"). */
  meta?: string;
  /** Optional badge/action after the label. */
  extra?: ReactNode;
  /** Highlight (weak) – shown with a text badge, never by colour alone. */
  flagged?: boolean;
}

/** Props of `BarRows`. */
export interface BarRowsProps {
  rows: BarRow[];
  /** Column headers of the table view. */
  columns: [string, string, string];
  caption: string;
  testId: string;
}

function Bar({ value }: { value: number | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none" className="block h-2 w-full">
      <rect x={0} y={0} width={100} height={8} rx={4} fill="var(--zz-surface-3)" />
      {value !== null && pct > 0 && <rect x={0} y={0} width={Math.max(pct, 2)} height={8} rx={4} fill="var(--zz-accent)" />}
    </svg>
  );
}

/** The bar rows with a table toggle. */
export function BarRows({ rows, columns, caption, testId }: BarRowsProps) {
  const id = useId();
  const [table, setTable] = useState(false);
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.key} className="flex min-w-0 flex-col gap-1" data-row={r.key} data-value={r.value ?? ''} data-flagged={r.flagged || undefined}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-body text-text">{r.label}</span>
                {r.extra}
              </span>
              <span className="shrink-0 text-body-sm text-muted">
                <span className="font-semibold tabular-nums text-text">{r.valueText}</span>
                {r.meta && <span> · {r.meta}</span>}
              </span>
            </div>
            <Bar value={r.value} />
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          aria-expanded={table}
          aria-controls={`${id}-table`}
          onClick={() => setTable((t) => !t)}
          className="min-h-11 text-body-sm font-medium text-accent-text underline-offset-4 hover:underline"
        >
          {table ? STRINGS_DE.tableToggleHide : STRINGS_DE.tableToggleShow}
        </button>
        {table && (
          <div id={`${id}-table`} className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-body-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="bg-surface-2">
                <tr>
                  {columns.map((c, i) => (
                    <th key={c} scope="col" className={i === 0 ? 'px-3 py-2 font-medium text-muted' : 'px-3 py-2 text-right font-medium text-muted'}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <th scope="row" className="px-3 py-1.5 font-normal text-text">
                      {r.label}
                    </th>
                    <td className="px-3 py-1.5 text-right tabular-nums text-text">{r.valueText}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-text">{r.meta ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

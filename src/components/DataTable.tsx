"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { fmtCell, type Fmt } from "@/lib/derive";
import type { Cell } from "@/lib/types";
import { Card, Empty, useMedia } from "./ui";

export interface TableProps {
  title: string;
  cols: string[];
  rows: Cell[][];
  fmt?: Fmt[];
  /** Column drawn as a bar behind the first cell, and the default sort. */
  bar?: number;
  sort?: number;
  max?: number;
  note?: ReactNode;
  empty?: string;
}

/** Sortable, filterable table on desktop; the same rows become stacked cards on a phone. */
export function DataTable({ title, cols, rows, fmt = [], bar, sort, max = 10, note, empty = "Nothing here yet." }: TableProps) {
  const id = useId();
  const small = useMedia("(max-width:767px)");
  const [col, setCol] = useState<number | null>(sort ?? bar ?? null);
  const [dir, setDir] = useState(-1);
  const [q, setQ] = useState("");
  const [lim, setLim] = useState<number | null>(null);
  const limit = lim ?? (small ? Math.min(max, 5) : max);

  const shown = useMemo(() => {
    const ql = q.toLowerCase();
    let r = rows.filter((x) => !ql || x.some((c) => String(c).toLowerCase().includes(ql)));
    if (col != null) {
      r = r.slice().sort((a, b) => {
        const x = a[col];
        const y = b[col];
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
      });
    }
    return r;
  }, [rows, q, col, dir]);

  if (!rows.length) {
    return (
      <Card title={title} note={note}>
        <Empty msg={empty} />
      </Card>
    );
  }
  const topVal = bar != null ? Math.max(1, ...shown.map((r) => +r[bar] || 0)) : 0;
  const vis = shown.slice(0, limit);
  const showFilter = true;
  const showRows = rows.length > Math.min(max, 5);
  const wide = cols.length >= 6;
  const th = (i: number) => (col === i ? (dir > 0 ? "ascending" : "descending") : "none");
  const numeric = (j: number) => fmt[j] === "n" || fmt[j] === "p" || fmt[j] === "dur" || fmt[j] === "pos";
  const pctOf = (r: Cell[]) => (bar != null ? Math.max(3, (100 * (+r[bar] || 0)) / topVal) : 0);

  return (
    <Card title={title} note={note} className={wide ? "md:col-span-2" : ""}>
      {(showFilter || rows.length > 1) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {showFilter && <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label={`Filter ${title}`} className="min-w-0 basis-full md:flex-1 md:basis-32" />}
          <select aria-label="Sort by" value={col ?? 0} onChange={(e) => { setCol(+e.target.value); setDir(-1); }} className="min-w-0 flex-1 md:hidden">
            {cols.map((c, i) => <option key={i} value={i}>Sort: {c}</option>)}
          </select>
          {showRows && (
            <select aria-label="Rows" value={limit} onChange={(e) => setLim(+e.target.value)}>
              {[...new Set([limit, max, 25, 100, 100000])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{v === 100000 ? "All" : `${v} rows`}</option>)}
            </select>
          )}
        </div>
      )}

      {/* desktop: the first column takes the free space, numbers sit tight on the right */}
      <div className="mt-3 hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c + i} aria-sort={th(i)} scope="col" className={`whitespace-nowrap border-b border-line py-2 text-[11.5px] font-medium ${i ? "w-px min-w-[5rem] px-3" : "pr-3"} ${numeric(i) ? "text-right" : "text-left"}`}>
                  <button type="button" aria-describedby={id} onClick={() => { if (col === i) setDir(-dir); else { setCol(i); setDir(-1); } }} className={`inline-flex items-center gap-1 hover:text-ink ${col === i ? "text-brand" : "text-dim"}`}>
                    {c}
                    <span aria-hidden="true" className="text-[9px]">{col === i ? (dir > 0 ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vis.map((r, ri) => (
              <tr key={ri} style={{ "--r": ri } as React.CSSProperties} className="row-in border-b border-line transition-colors last:border-0 hover:bg-white/[.04]">
                {r.map((c, j) =>
                  j === 0 ? (
                    <td key={j} className="max-w-0 py-2.5 pr-3" title={String(c)}>
                      <div className="truncate">{fmtCell(c, fmt[0])}</div>
                      {bar != null && (
                        <div aria-hidden="true" className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[.06]">
                          <div className="bar-grow h-full rounded-full bg-brand/70" style={{ width: `${pctOf(r)}%`, animationDelay: `${Math.min(ri, 12) * 28 + 200}ms` }} />
                        </div>
                      )}
                    </td>
                  ) : (
                    <td key={j} className={`w-px min-w-[5rem] whitespace-nowrap px-3 py-2.5 align-top text-[12.5px] ${numeric(j) ? "text-right font-mono text-ink/90" : "text-left text-mute"}`}>
                      {fmtCell(c, fmt[j])}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span id={id} className="sr-only">Click a heading to sort</span>

      {/* phone: each row becomes a card */}
      <ul className="mt-3 space-y-2 md:hidden">
        {vis.map((r, ri) => (
          <li key={ri} style={{ "--r": ri } as React.CSSProperties} className="row-in overflow-hidden rounded-xl border border-line bg-card2/60">
            <div className="p-3">
              <div className="break-words text-[13.5px] font-medium">{fmtCell(r[0], fmt[0])}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                {r.slice(1).map((c, j) => (
                  <div key={j} className="min-w-0">
                    <dt className="text-[11px] text-dim">{cols[j + 1]}</dt>
                    <dd className={`break-words text-[12.5px] ${numeric(j + 1) ? "font-mono text-ink/90" : "text-mute"}`}>{fmtCell(c, fmt[j + 1])}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {bar != null && <div aria-hidden="true" className="h-[3px] bg-white/[.05]"><div className="bar-grow h-full bg-brand/70" style={{ width: `${pctOf(r)}%` }} /></div>}
          </li>
        ))}
      </ul>

      {(shown.length > vis.length || q) && (
        <p className="mt-2 font-mono text-[11.5px] text-dim">Showing {Math.min(shown.length, vis.length)} of {shown.length}{q ? " matching" : ""} rows</p>
      )}
      {!vis.length && <Empty msg="No rows match that filter." />}
    </Card>
  );
}

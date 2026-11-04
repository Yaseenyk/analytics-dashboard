"use client";

import { useEffect, useMemo, useState } from "react";
import { n } from "@/lib/derive";
import { Card } from "./ui";

interface World {
  /** SVG viewBox: x, y, width, height. */
  vb: [number, number, number, number];
  countries: { n: string; d: string }[];
  dots: { n: string; x: number; y: number }[];
}

/** Compare names without caring about case, accents, "&" or punctuation. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

/** Google Analytics country names that differ from the map's (Natural Earth) names. */
const ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries({
    "United States": "United States of America",
    Türkiye: "Turkey",
    "Congo - Kinshasa": "Dem. Rep. Congo",
    "Congo - Brazzaville": "Congo",
    "Myanmar (Burma)": "Myanmar",
    "Bosnia & Herzegovina": "Bosnia and Herz.",
    "North Macedonia": "Macedonia",
    "Dominican Republic": "Dominican Rep.",
    "Central African Republic": "Central African Rep.",
    "South Sudan": "S. Sudan",
    "Equatorial Guinea": "Eq. Guinea",
    "Palestinian Territories": "Palestine",
    "Western Sahara": "W. Sahara",
    "Solomon Islands": "Solomon Is.",
    "Falkland Islands (Islas Malvinas)": "Falkland Is.",
    "Trinidad & Tobago": "Trinidad and Tobago",
    "Côte d’Ivoire": "Côte d'Ivoire",
    "Czech Republic": "Czechia",
    "Hong Kong SAR China": "Hong Kong",
    "Macao SAR China": "Macao",
  }).map(([k, v]) => [norm(k), norm(v)]),
);
const key = (name: string) => ALIAS[norm(name)] ?? norm(name);

/**
 * Where visitors are, as a shaded world map beside a ranked list. Pass [country, count] rows; a country the
 * map cannot place still shows in the list. The shapes load on demand so they cost nothing until this card shows.
 */
export default function WorldMap({
  title,
  note,
  rows,
  unit,
  empty = "No visitors with a known country in this period.",
}: {
  title: string;
  note?: string;
  rows: [string, number][];
  /** What the numbers count, e.g. "visits" or "users". */
  unit: string;
  empty?: string;
}) {
  const [world, setWorld] = useState<World | null>(null);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    import("@/lib/world.json").then((m) => live && setWorld(m.default as World));
    return () => {
      live = false;
    };
  }, []);

  const data = useMemo(() => {
    const byKey = new Map<string, { name: string; v: number }>();
    for (const [name, v] of rows) {
      if (!name || name === "(not set)" || !(v > 0)) {
        continue;
      }
      const k = key(name);
      const cur = byKey.get(k);
      byKey.set(k, { name: cur?.name ?? name, v: (cur?.v ?? 0) + v });
    }
    const list = [...byKey.entries()].map(([k, x]) => ({ k, ...x })).sort((a, b) => b.v - a.v);
    return { byKey, list, max: list[0]?.v ?? 1 };
  }, [rows]);

  if (!data.list.length) {
    return (
      <Card title={title} note={note}>
        <p className="sub">{empty}</p>
      </Card>
    );
  }

  const shade = (v: number) => 0.28 + 0.72 * Math.sqrt(v / data.max);
  const active = pick ? data.byKey.get(key(pick)) : undefined;

  return (
    <Card title={title} note={note}>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div>
          <div className="relative overflow-hidden rounded-xl border border-line bg-card2/40">
            {world ? (
              <svg
                viewBox={world.vb.join(" ")}
                role="img"
                aria-label={`World map shaded by ${unit}. The list beside it has the numbers.`}
                className="block h-auto w-full"
                onMouseLeave={() => setPick(null)}
              >
                {world.countries.map((c) => {
                  const hit = data.byKey.get(key(c.n));
                  return (
                    <path
                      key={c.n}
                      d={c.d}
                      fill={hit ? "rgb(var(--brand-rgb))" : "var(--card2)"}
                      fillOpacity={hit ? shade(hit.v) : 1}
                      stroke="var(--line2)"
                      strokeWidth={0.5}
                      onMouseEnter={() => setPick(c.n)}
                      onClick={() => setPick(c.n)}
                    />
                  );
                })}
                {world.dots
                  .filter((d) => data.byKey.has(key(d.n)))
                  .map((d) => (
                    <circle
                      key={d.n}
                      cx={d.x}
                      cy={d.y}
                      r={5}
                      fill="rgb(var(--brand-rgb))"
                      stroke="var(--text)"
                      strokeWidth={0.8}
                      onMouseEnter={() => setPick(d.n)}
                      onClick={() => setPick(d.n)}
                    />
                  ))}
              </svg>
            ) : (
              <div className="aspect-[2/1] w-full animate-pulse bg-card2/60" aria-hidden="true" />
            )}
          </div>
          <p className="mt-2 min-h-[1.25rem] font-mono text-xs text-mute" aria-live="polite">
            {active ? `${active.name}: ${n(active.v)} ${unit}` : "Hover or tap a country for its numbers."}
          </p>
        </div>

        <ol className="space-y-1.5 self-start">
          {data.list.slice(0, 8).map((x) => (
            <li key={x.k}>
              <button
                type="button"
                onClick={() => setPick(x.name)}
                className="relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-sm text-ink"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-lg bg-brand/15"
                  style={{ width: `${Math.max(4, (x.v / data.max) * 100)}%` }}
                  aria-hidden="true"
                />
                <span className="relative truncate">{x.name}</span>
                <span className="relative font-mono text-xs tabular-nums text-mute">{n(x.v)}</span>
              </button>
            </li>
          ))}
          {data.list.length > 8 && (
            <li className="px-2.5 pt-1 font-mono text-xs text-dim">+ {data.list.length - 8} more countries</li>
          )}
        </ol>
      </div>
    </Card>
  );
}

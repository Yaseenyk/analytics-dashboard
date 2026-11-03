"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SITES } from "./config";

interface F {
  range: string;
  site: string;
  cmp: boolean;
  setRange: (r: string) => void;
  setSite: (s: string) => void;
  setCmp: (c: boolean) => void;
}
const Ctx = createContext<F>({ range: "28d", site: "all", cmp: true, setRange() {}, setSite() {}, setCmp() {} });
export const useFilters = () => useContext(Ctx);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [range, setR] = useState("28d");
  const [site, setS] = useState("all");
  const [cmp, setC] = useState(true);

  // Restore the last choice (and honour a shared link such as ?range=7d&site=yk.streamerosai.com).
  useEffect(() => {
    try {
      const sv = JSON.parse(localStorage.getItem("dash2") || "{}");
      if (sv.range) setR(sv.range);
      if (typeof sv.cmp === "boolean") setC(sv.cmp);
      const q = new URLSearchParams(window.location.search);
      if (q.get("range")) setR(q.get("range")!);
      const s = q.get("site");
      if (s && SITES[s]) setS(s);
    } catch {
      /* storage can be blocked */
    }
  }, []);
  const save = useCallback((p: { range?: string; cmp?: boolean }) => {
    try {
      const cur = JSON.parse(localStorage.getItem("dash2") || "{}");
      localStorage.setItem("dash2", JSON.stringify({ ...cur, ...p }));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<F>(
    () => ({
      range,
      site,
      cmp,
      setRange: (r) => {
        setR(r);
        save({ range: r });
      },
      setSite: setS,
      setCmp: (c) => {
        setC(c);
        save({ cmp: c });
      },
    }),
    [range, site, cmp, save],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

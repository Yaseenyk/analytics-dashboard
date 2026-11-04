"use client";

import { group, ix, rep } from "@/lib/derive";
import { Card, Sk, SkCard } from "@/components/ui";

/** GA4 sends "(not set)" or a blank when it cannot place a visitor (privacy tools, VPNs, bots). That is not a missing tag. */
const place = (v: string) => (!v || v === "(not set)" ? "Location unknown" : v);
import { GaDonut, GaRank, GaTable, WaitingGate, cols2, useGaMemo } from "./kit";

const two = (title: string, name: string, dim: string) => (
  <GaDonut
    title={title}
    build={(ga, site) => {
      const r = rep(ga, name);
      return group(r, [ix(r, dim)], site).map((g) => [g.k[0] || "(unknown)", g.m[0]] as [string, number]);
    }}
  />
);

function TimeOfDay() {
  const { v } = useGaMemo((ga, site) => {
    const hm: Record<number, number> = {};
    let mx = 1;
    group(rep(ga, "hour"), [1], site).forEach((g) => {
      hm[+g.k[0]] = g.m[0];
      mx = Math.max(mx, g.m[0]);
    });
    return { hm, mx };
  });
  if (!v) {
    return (
      <SkCard className="space-y-3">
        <Sk w={24} h={14} />
        <Sk h={40} />
      </SkCard>
    );
  }
  return (
    <Card title="Time of day" note="Visits by hour. Brighter is busier.">
      <div className="mt-3 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} title={`${i}:00 · ${v.hm[i] || 0} visits`} className="h-9 rounded-[4px] bg-brand" style={{ opacity: 0.08 + (0.92 * (v.hm[i] || 0)) / v.mx }} />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px] font-mono text-[10px] text-dim">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="text-center">{i % 6 === 0 ? i : ""}</span>
        ))}
      </div>
    </Card>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Audience() {
  return (
    <WaitingGate>
      <div className={cols2.replace("items-start", "items-stretch")}>
        {two("Devices", "devices", "deviceCategory")}
        <GaDonut
          title="New vs returning people"
          build={(ga, site) => {
            const out: Record<string, number> = {};
            group(rep(ga, "newReturning"), [1], site).forEach((g) => (out[g.k[0]] = g.m[1]));
            return ([["New", out.new || 0], ["Returning", out.returning || 0]] as [string, number][]).filter((x) => x[1] > 0);
          }}
        />
        {two("Browsers", "browsers", "browser")}
        {two("Operating systems", "os", "operatingSystem")}
        <GaTable
          title="Countries"
          cols={["Country", "Visits", "People", "Leads and clicks"]}
          bar={1}
          fmt={[0, "n", "n", "n"]}
          max={10}
          build={(ga, site) => {
            const r = rep(ga, "countries");
            return group(r, [ix(r, "country")], site).map((g) => [place(g.k[0]), g.m[0], g.m[1], g.m[2]]);
          }}
        />
        <GaTable
          title="Cities"
          cols={["City", "Country", "Visits", "Leads and clicks"]}
          bar={2}
          fmt={[0, 0, "n", "n"]}
          max={10}
          build={(ga, site) => {
            const r = rep(ga, "cities");
            return group(r, [ix(r, "city"), ix(r, "country")], site).map((g) => [place(g.k[0]), place(g.k[1]), g.m[0], g.m[1]]);
          }}
        />
        <GaTable
          title="Languages"
          cols={["Language", "Visits", "Leads and clicks"]}
          bar={1}
          fmt={[0, "n", "n"]}
          build={(ga, site) => {
            const r = rep(ga, "languages");
            return group(r, [ix(r, "language")], site).map((g) => [place(g.k[0]), g.m[0], g.m[1]]);
          }}
        />
        <GaRank
          title="Day of week"
          max={7}
          build={(ga, site) => {
            const wm: Record<string, number> = {};
            group(rep(ga, "weekday"), [1], site).forEach((g) => (wm[g.k[0]] = g.m[0]));
            return DAYS.map((nm, i) => [nm, wm[i] || 0]);
          }}
        />
        <div className="md:col-span-2">
          <TimeOfDay />
        </div>
      </div>
    </WaitingGate>
  );
}

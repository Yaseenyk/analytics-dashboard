"use client";

import { SITES, STREAMS } from "@/lib/config";
import { useFilters } from "@/lib/filters";
import { useLive } from "@/lib/data";
import { DataTable } from "@/components/DataTable";
import { SkTable } from "@/components/ui";
import WorldMap from "@/components/WorldMap";
import { cols2 } from "./kit";

export default function Live() {
  const f = useFilters();
  const e = useLive();
  const l = e.data;
  if (!l) return <div className={cols2}><SkTable /><SkTable /><SkTable /><SkTable /></div>;
  const nm = (x: unknown) => STREAMS[String(x)] || String(x);
  const mine = (x: unknown) => f.site === "all" || STREAMS[String(x)] === SITES[f.site];
  return (
    <>
      <div className="mb-4">
        <WorldMap title="Online now, by country" rows={l.countries.rows.map((x) => [String(x[0] ?? ""), Number(x[1])] as [string, number])} unit="users" empty="Nobody right now." />
      </div>
      <div className={cols2}>
        <DataTable title="Online now, by site (last 30 minutes)" cols={["Site", "Users", "Views", "Events"]} bar={1} fmt={[0, "n", "n", "n"]} empty="Nobody right now." rows={l.streams.rows.filter((x) => mine(x[0])).map((x) => [nm(x[0]), x[1], x[2], x[3]])} />
        <DataTable title="Pages being viewed" cols={["Page", "Site", "Users"]} bar={2} fmt={[0, 0, "n"]} empty="Nothing right now." rows={l.pages.rows.filter((x) => mine(x[0])).map((x) => [x[1], nm(x[0]), x[2]])} />
        <DataTable title="Where they are" cols={["Country", "Users"]} bar={1} fmt={[0, "n"]} empty="Nothing right now." rows={l.countries.rows.map((x) => [x[0] || "(unknown)", x[1]])} />
        <DataTable title="What they are doing" cols={["Event", "Site", "Count"]} bar={2} fmt={[0, 0, "n"]} empty="Nothing right now." rows={(l.events?.rows ?? []).filter((x) => mine(x[0])).map((x) => [x[1], nm(x[0]), x[2]])} />
      </div>
      <p className="sub">Press the refresh button at the top for the latest. Snapshot from {new Date(l.generatedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.{f.site !== "all" ? " Countries are not split by site." : ""}</p>
    </>
  );
}

"use client";

import { STREAMS } from "@/lib/config";
import { useLive, useLivePolling } from "@/lib/data";
import { DataTable } from "@/components/DataTable";
import { SkTable } from "@/components/ui";
import { cols2 } from "./kit";

export default function Live() {
  useLivePolling(30000);
  const e = useLive();
  const l = e.data;
  if (!l) return <div className={cols2}><SkTable /><SkTable /><SkTable /><SkTable /></div>;
  const nm = (x: unknown) => STREAMS[String(x)] || String(x);
  return (
    <>
      <div className={cols2}>
        <DataTable title="Online now, by site (last 30 minutes)" cols={["Site", "Users", "Views", "Events"]} bar={1} fmt={[0, "n", "n", "n"]} empty="Nobody right now." rows={l.streams.rows.map((x) => [nm(x[0]), x[1], x[2], x[3]])} />
        <DataTable title="Pages being viewed" cols={["Page", "Site", "Users"]} bar={2} fmt={[0, 0, "n"]} empty="Nothing right now." rows={l.pages.rows.map((x) => [x[1], nm(x[0]), x[2]])} />
        <DataTable title="Where they are" cols={["Country", "Users"]} bar={1} fmt={[0, "n"]} empty="Nothing right now." rows={l.countries.rows.map((x) => [x[0] || "(unknown)", x[1]])} />
        <DataTable title="What they are doing" cols={["Event", "Site", "Count"]} bar={2} fmt={[0, 0, "n"]} empty="Nothing right now." rows={(l.events?.rows ?? []).map((x) => [x[1], nm(x[0]), x[2]])} />
      </div>
      <p className="sub">Updates every 30 seconds while this page is open. Snapshot from {new Date(l.generatedAt).toLocaleTimeString()}.</p>
    </>
  );
}

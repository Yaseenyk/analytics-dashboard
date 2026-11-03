# analytics-dashboard

One page for every site: Google Analytics 4 and Search Console, served from GitHub Pages at
https://analytics.streamerosai.com. Built with Next.js 14 (static export), TypeScript and Tailwind.

## How it works

- `scripts/build.mjs` signs in with a read-only Google service account and pulls GA4 and Search Console data for
  7 days, 28 days, 3, 6, 12 and 16 months (each with the previous period for comparison) into `public/data/`:
  `meta.json`, `live.json`, `ga-<range>.json` and `gsc-<range>.json` (aggregate numbers only, gitignored).
- The Next.js app in `src/` is exported to `out/` and deployed to GitHub Pages by
  `.github/workflows/dashboard.yml`, which runs every 2 hours and on every push.
- The page is public and has no login: anyone with the link can read the numbers. The Google key stays in
  repository secrets and is never published.

## Blocks load on their own

`src/lib/data.ts` keeps one store entry per data file. Every card (a `GaTable`, `GscKpi`, `AreaChart` and so on in
`src/views/`) subscribes to just the file it reads, shows its own skeleton until that file arrives, and renders
alone. A slow Search Console answer never redraws the Google Analytics cards, and a live answer that matches the
published copy causes no render at all. Each route (`/`, `/sources`, `/pages`, `/leads`, `/search`, `/audience`,
`/live`, `/tools`) is its own small bundle.

```
src/lib/        config, types, data store (hooks), derive (grouping, sources, Search Console maths), filters
src/components  Shell (nav, header, filters), charts, DataTable, ui (cards, skeletons, KPI)
src/views/      one file per tab, built from block components in kit.tsx
```

## Run it

```bash
npm install
GA_SERVICE_ACCOUNT_JSON='...' npm run data   # writes public/data (skip to use an older copy)
npm run dev                                  # http://localhost:3000
npm run build                                # static export to out/
```

`?api=off` turns the live Worker off (published copy only); `?api=<url>` points at another API.

## Setup (already done)

Repository secret: `GA_SERVICE_ACCOUNT_JSON` (the service account key).

The service account must be a Viewer on the GA4 property and a user on each Search Console property.
Scheduled workflows in a public repo are paused after 60 days without repository activity; if that happens,
re-enable it under the Actions tab.

## Live data on open

`worker/` is a Cloudflare Worker (`analytics-api`, free plan) that runs the same Google queries as the Action and
returns the same JSON files, cached for 45 seconds (online now) to 15 minutes (Search Console). The dashboard shows
the copy GitHub publishes instantly, then replaces a block's numbers only if the live ones differ. If the Worker is
down it keeps the published copy. The Google key is a Worker secret (`GA_SERVICE_ACCOUNT_JSON`), never sent to the
browser, and the Worker only answers requests from analytics.streamerosai.com.

Deploy or update: `cd worker && npx wrangler deploy`. Change the key: `npx wrangler secret put GA_SERVICE_ACCOUNT_JSON`.

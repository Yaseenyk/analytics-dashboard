# analytics-dashboard

One page for every site: Google Analytics 4 and Search Console, rebuilt every 6 hours by GitHub Actions and
served from GitHub Pages at https://analytics.streamerosai.com.

- `scripts/build.mjs` signs in with a read-only Google service account and pulls GA4 and Search Console data for
  7 days, 28 days, 3, 6, 12 and 16 months (each with the previous period for comparison) into `site/data/`:
  `meta.json`, `live.json`, `ga-<range>.json` and `gsc-<range>.json` (aggregate numbers only).
- `site/index.html` loads only the range and source you open (lazy loading) and draws the dashboard. It works on
  phones and desktops, with sortable and filterable tables and a Search Console style Search tab.
- `.github/workflows/dashboard.yml` runs every 2 hours and deploys the `site/` folder to GitHub Pages.
- The page is public and has no login: anyone with the link can read the numbers. The Google key stays in
  repository secrets and is never published.

## Setup (already done)

Repository secret: `GA_SERVICE_ACCOUNT_JSON` (the service account key).

The service account must be a Viewer on the GA4 property and a user on each Search Console property.
Scheduled workflows in a public repo are paused after 60 days without repository activity; if that happens,
re-enable it under the Actions tab.

## Live data on open

`worker/` is a Cloudflare Worker (`analytics-api`, free plan) that runs the same Google queries as the Action and
returns the same JSON files, cached for 45 seconds (online now) to 15 minutes (Search Console). The dashboard shows
the copy GitHub publishes every 2 hours instantly, then swaps in the Worker's live data. If the Worker is down it
keeps the published copy. The Google key is a Worker secret (`GA_SERVICE_ACCOUNT_JSON`), never sent to the browser,
and the Worker only answers requests from analytics.streamerosai.com.

Deploy or update: `cd worker && npx wrangler deploy`. Change the key: `npx wrangler secret put GA_SERVICE_ACCOUNT_JSON`.

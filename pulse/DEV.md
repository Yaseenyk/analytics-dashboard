# Running the tracker on your computer (dev mode, no key)

Dev mode runs the tracker Worker locally on a copy of the real data, with **no key**, and tells you how many database rows every request
reads (the number the free D1 plan limits to 5,000,000 a day). It switches on only when `PULSE_DEV=1` **and** the request is really to
localhost, so the live Worker (which never sets it) is unchanged.

```bash
# 1. once: copy the live data into a local database (read-only on the live one; the copy stays in pulse/.wrangler, which git ignores)
cd pulse
npx wrangler d1 export site-pulse --remote --output .wrangler/prod-dump.sql
rm -rf .wrangler/state
npx wrangler d1 execute site-pulse --local --file .wrangler/prod-dump.sql

# 2. start the tracker (http://127.0.0.1:8787, no key)
npx wrangler dev --local --port 8787 --var PULSE_DEV:1

# 3. (optional) the dashboard pointed at it
cd ..
NEXT_PUBLIC_PULSE_API=http://127.0.0.1:8787 npm run dev      # PowerShell: $env:NEXT_PUBLIC_PULSE_API="http://127.0.0.1:8787"; npm run dev
```

In dev mode:
- Every answer carries `X-Rows-Read` and `X-Queries` headers: what that request cost the database.
- `GET /dev/sql?q=SELECT ...` runs one read-only query and reports `rowsRead` (to find out what a query costs).
- `?fresh=1` skips the wait between calculations (it never skips the read-allowance guard); add any extra parameter (`&k=1`) to get a new saved answer.
- The dashboard asks for no key and shows the private views.
- The esports card shows an error locally (that database is not copied).

How the database is protected (pulse/src/cache.js, `governed`): the heavy answers (summary, insights, goals, visits feed) are worked out again
only when new data has arrived, at most every 2 minutes, and the wait grows as the day's read allowance fills (10 minutes past 40%, an
hour past 70%, saved answer only past 90%). A repeat load costs about 15 rows; a real calculation about 67,000.
`pulse/src/agg.js` is a verified in-memory version (about 6,000 rows) that needs a paid Workers plan (it uses 50-200 ms of CPU; the free plan allows 10 ms).

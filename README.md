# analytics-dashboard

One page for every site: Google Analytics 4 and Search Console, rebuilt every 6 hours by GitHub Actions and
served from GitHub Pages at https://analytics.streamerosai.com.

- `scripts/build.mjs` signs in with a read-only Google service account, pulls the reports, and encrypts them
  (AES-256-GCM, key from PBKDF2 of the passphrase) into `site/data.json`.
- `site/index.html` asks for the passphrase and decrypts in the browser. GitHub Pages is public, so the data is
  encrypted rather than hidden behind a login. Nothing readable is committed or published.
- `.github/workflows/dashboard.yml` runs it and deploys the `site/` folder.

## Setup (already done)

Repository secrets: `GA_SERVICE_ACCOUNT_JSON` (the service account key) and `DASHBOARD_PASSPHRASE`.
To change the passphrase: `gh secret set DASHBOARD_PASSPHRASE -R Yaseenyk/analytics-dashboard`, then run the workflow.

The service account must be a Viewer on the GA4 property and a user on each Search Console property.
Scheduled workflows in a public repo are paused after 60 days without repository activity; if that happens,
re-enable it under the Actions tab.

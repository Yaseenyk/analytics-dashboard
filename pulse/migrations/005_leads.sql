-- Run once on the live database (schema.sql already has this for new databases):
--   wrangler d1 execute site-pulse --remote --file=migrations/005_leads.sql
-- Form inbox: every enquiry, sign-up and feedback form on the sites. What the visitor typed into the form, the form's
-- name, the page, and the visit's source. No IP address, no user agent. Kept 24 months (spam 30 days). See src/leads.js.
CREATE TABLE IF NOT EXISTS leads (
  id           TEXT PRIMARY KEY,
  ts           INTEGER NOT NULL,
  site         TEXT NOT NULL,
  form         TEXT NOT NULL DEFAULT 'form',
  name         TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL DEFAULT '',
  extra        TEXT NOT NULL DEFAULT '{}',
  path         TEXT NOT NULL DEFAULT '',
  landing      TEXT NOT NULL DEFAULT '',
  sid          TEXT NOT NULL DEFAULT '',
  ref_host     TEXT NOT NULL DEFAULT '',
  ref_kind     TEXT NOT NULL DEFAULT '',
  utm_source   TEXT NOT NULL DEFAULT '',
  utm_medium   TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  country      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'new',
  note         TEXT NOT NULL DEFAULT '',
  updated      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS leads_ts ON leads (ts);
CREATE INDEX IF NOT EXISTS leads_site_ts ON leads (site, ts);

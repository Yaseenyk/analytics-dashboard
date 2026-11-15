-- pulse: first-party visit tracking. One row per page view, one row per click. No IP addresses, no user agents.
CREATE TABLE IF NOT EXISTS hits (
  id          TEXT PRIMARY KEY,
  sid         TEXT NOT NULL,
  site        TEXT NOT NULL,
  path        TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  last        INTEGER NOT NULL,
  ref_host    TEXT NOT NULL DEFAULT '',
  ref_path    TEXT NOT NULL DEFAULT '',
  ref_kind    TEXT NOT NULL DEFAULT 'direct',
  utm_source  TEXT NOT NULL DEFAULT '',
  utm_medium  TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  country     TEXT NOT NULL DEFAULT '',
  device      TEXT NOT NULL DEFAULT '',
  browser     TEXT NOT NULL DEFAULT '',
  os          TEXT NOT NULL DEFAULT '',
  w           INTEGER NOT NULL DEFAULT 0,
  h           INTEGER NOT NULL DEFAULT 0,
  lang        TEXT NOT NULL DEFAULT '',
  org         TEXT NOT NULL DEFAULT '',
  asn         INTEGER NOT NULL DEFAULT 0,
  human       INTEGER NOT NULL DEFAULT 0,
  bot         INTEGER NOT NULL DEFAULT 0,
  dc          INTEGER NOT NULL DEFAULT 0,
  wd          INTEGER NOT NULL DEFAULT 0,
  scroll      INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS hits_ts ON hits (ts);
CREATE INDEX IF NOT EXISTS hits_last ON hits (last);
CREATE INDEX IF NOT EXISTS hits_site_ts ON hits (site, ts);
CREATE INDEX IF NOT EXISTS hits_sid ON hits (sid);

CREATE TABLE IF NOT EXISTS clicks (
  hid   TEXT NOT NULL,
  n     INTEGER NOT NULL,
  ts    INTEGER NOT NULL,
  site  TEXT NOT NULL,
  path  TEXT NOT NULL,
  kind  TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  href  TEXT NOT NULL DEFAULT '',
  x     INTEGER NOT NULL DEFAULT 0,
  y     INTEGER NOT NULL DEFAULT 0,
  sec   TEXT NOT NULL DEFAULT '',
  z     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hid, n)
);
CREATE INDEX IF NOT EXISTS clicks_ts ON clicks (ts);
CREATE INDEX IF NOT EXISTS clicks_page ON clicks (site, path, ts);

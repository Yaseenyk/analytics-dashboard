-- Run once on the live database (schema.sql already has these for new databases):
--   wrangler d1 execute site-pulse --remote --file=migrations/004_health_details.sql
ALTER TABLE hits ADD COLUMN tr  INTEGER NOT NULL DEFAULT 0;  -- 1 when the browser translated the page (Google Translate)
ALTER TABLE hits ADD COLUMN tl  TEXT    NOT NULL DEFAULT ''; -- the language it was translated into
ALTER TABLE hits ADD COLUMN net TEXT    NOT NULL DEFAULT ''; -- connection type the browser reports: 4g, 3g, 2g, slow-2g
ALTER TABLE hits ADD COLUMN inp INTEGER NOT NULL DEFAULT 0;  -- slowest response to a tap or key on the page, ms
ALTER TABLE hits ADD COLUMN cls INTEGER NOT NULL DEFAULT 0;  -- layout jumps (CLS x 1000), first page of a visit only
-- Script errors with their message: up to three per page view. Code messages only, never anything a visitor typed.
CREATE TABLE IF NOT EXISTS errs (
  hid  TEXT NOT NULL,
  ts   INTEGER NOT NULL,
  site TEXT NOT NULL,
  path TEXT NOT NULL,
  msg  TEXT NOT NULL,
  tr   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS errs_ts ON errs (ts);

-- Run once on the live database (the CREATE TABLE in schema.sql already has these for new databases):
--   wrangler d1 execute site-pulse --remote --file=migrations/002_status_speed_errors.sql
ALTER TABLE hits ADD COLUMN st  INTEGER NOT NULL DEFAULT 0; -- HTTP status of the page load (404 = a broken page someone reached)
ALTER TABLE hits ADD COLUMN lcp INTEGER NOT NULL DEFAULT 0; -- largest contentful paint in ms, first page of a visit only
ALTER TABLE hits ADD COLUMN err INTEGER NOT NULL DEFAULT 0; -- count of JavaScript errors on the page (no messages stored)

-- 18 Nov 2026: count people instead of page views, leave out the owner's devices, and know how long an idle visit stayed.
-- vid: a one-way code for "the same visitor today" (random daily salt + address + browser name, hashed; the salt is deleted the next day).
-- me: 1 when the visit came from a device the owner marked as their own. seen: seconds the page was on screen.
ALTER TABLE hits ADD COLUMN vid TEXT NOT NULL DEFAULT '';
ALTER TABLE hits ADD COLUMN me INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hits ADD COLUMN seen INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS hits_vid ON hits (vid);
CREATE TABLE IF NOT EXISTS salts (
  day  TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);

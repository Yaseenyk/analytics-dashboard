/**
 * Esports Hub numbers for the dashboard, read from the esports app's own database (binding ESPORTS_DB, SELECT only).
 *   GET /v/esports   sign-ups, confirmed emails, organisations, teams, events, and the feedback sent from the app.  Needs PULSE_KEY.
 * Returns counts and feedback text; never password hashes, never email addresses of people who signed up.
 */
const one = async (db, sql, args = []) => ((await db.prepare(sql).bind(...args).all()).results || [])[0] || {};
const all = async (db, sql, args = []) => (await db.prepare(sql).bind(...args).all()).results || [];

export async function esportsStats(env, q) {
  const db = env.ESPORTS_DB;
  if (!db) return { ok: false, error: 'esports database not bound' };
  const days = Math.min(3650, Math.max(1, parseInt(q.get('days') || '90', 10) || 90));
  const sinceIso = new Date(Date.now() - days * 864e5).toISOString();
  const sinceSec = Math.floor(Date.now() / 1000) - days * 86400;
  const [users, inPeriod, daily, counts, feedback, contacts] = await Promise.all([
    one(db, `SELECT COUNT(*) AS total, SUM(CASE WHEN email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified, SUM(CASE WHEN discord_user_id IS NOT NULL AND discord_user_id!='' THEN 1 ELSE 0 END) AS discord, MAX(created_at) AS last FROM users`),
    one(db, `SELECT COUNT(*) AS n, SUM(CASE WHEN email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified FROM users WHERE created_at>=?`, [sinceIso]),
    all(db, `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM users WHERE created_at>=? GROUP BY day ORDER BY day`, [sinceIso]),
    one(db, `SELECT (SELECT COUNT(*) FROM organisations) AS orgs, (SELECT COUNT(*) FROM teams) AS teams, (SELECT COUNT(*) FROM events) AS events, (SELECT COUNT(*) FROM tournaments) AS tournaments, (SELECT COUNT(*) FROM registrations) AS registrations, (SELECT COUNT(*) FROM player_profiles) AS players`),
    all(db, `SELECT id, created_at, kind, message, page_path, signed_in, contact, status FROM feedback_reports WHERE created_at>=? ORDER BY created_at DESC LIMIT 50`, [sinceSec]),
    all(db, `SELECT id, created_at, name, email, message FROM contact_messages ORDER BY created_at DESC LIMIT 50`),
  ]);
  return { generatedAt: new Date().toISOString(), days, users, inPeriod, daily, counts, feedback, contacts };
}

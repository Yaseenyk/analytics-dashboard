# Multi-company login for the analytics dashboard (plan, not built)

Written 5 Nov 2026. Parked until the user says go. Everything here is free; nothing needs a credit card.

## What the user wants

- Login, signup and password reset on the dashboard.
- An admin panel where the owner adds a company, the sites it may see, and the emails of its people.
- Each invited person gets an email from contact@streamerosai.com with a signup link.
- Database and login on free Firebase (Firestore + Auth).

## Free stack (checked 5 Nov 2026 against the vendors' pricing pages)

| Job | Use | Free limit |
|---|---|---|
| Login, signup, reset | Firebase Authentication, Spark plan | 50,000 monthly active users |
| Database | Firestore, Spark plan | 1 GiB stored; 50k reads, 20k writes, 20k deletes per day |
| Backend logic (invites, token checks, filtering) | the existing Cloudflare Worker `analytics-api` | 100k requests/day, 10 ms CPU per request |
| Hosting | GitHub Pages (unchanged) | – |
| Invite emails as contact@streamerosai.com | Resend free plan | 3,000/month, 100/day, 3 domains; needs 3 DNS records at GoDaddy |
| Invite emails with no extra service | Firebase Auth's own signup/reset emails (sender is a Firebase address unless the custom-domain option is set up: not verified) | – |
| Invite with no email at all | admin panel makes a one-time signup link; owner sends it by WhatsApp or own mailbox | – |

**Avoid Firebase Cloud Functions**: they require the paid Blaze plan. The Worker does the same job.

Sources: https://firebase.google.com/pricing and https://resend.com/pricing

## How it would work

1. Owner signs in as admin, adds a company: name, allowed sites, people's emails.
2. Worker writes it to Firestore (`companies/{id}`, `invites/{token}`) and sends each person the invite link (Resend, or Firebase's own email, or copy-link).
3. Person opens the link and sets a password (Firebase Auth, email/password). Only invited emails may sign up: the Worker checks `invites` before `createUser`.
4. Every data request from the dashboard carries the Firebase ID token. The Worker verifies it (Google's public keys, no library needed), looks up the company, and returns only that company's sites.

## Consequences and open questions

- **The dashboard is public today**: the data files are static on GitHub Pages and anyone can open them. Company-only data means stopping the static publish of those files and serving everything through the Worker after login. The user has said the public numbers help credibility, so the likely shape is: a small public overview stays, the rest goes behind login.
- **Whose sites do companies see?** (Not answered yet.)
  - Only the owner's sites: the Worker just filters by host. Easy.
  - Their own websites: each company must add our Google service account (`GA_SERVICE_ACCOUNT_JSON`'s `client_email`) as a viewer on its GA4 property and Search Console property. Free, but a step they do. The Worker would then need per-company GA4 property IDs and GSC property URLs in Firestore.
- **Worker CPU limit**: filtering the big GA files per request may exceed 10 ms CPU. Cache filtered results in KV per company per range.
- **Mailbox**: Resend only *sends* as contact@streamerosai.com; replies need a real inbox at that address.

## What the owner does first (cannot be done from this side)

1. Create a Firebase project; enable Email/Password sign-in and Firestore (Spark plan).
2. (If Resend) create a Resend account, add streamerosai.com, put its 3 DNS records at GoDaddy.
3. Hand over: the Firebase web config (public), and a Firebase service-account JSON to set as a Worker secret (`FIREBASE_SA_JSON`), plus `RESEND_API_KEY` if used.

## Build order (when approved)

1. Firestore schema + Worker endpoints: `POST /admin/companies`, `POST /admin/invite`, `GET /me`.
2. Admin panel tab (owner only).
3. Login, signup-from-invite, password reset pages.
4. Token check on data routes; per-company filtering with KV cache.
5. Stop publishing the private data files; keep the public overview.
6. Tests for every Worker route (vitest, same pattern as `tests/worker.test.ts`).

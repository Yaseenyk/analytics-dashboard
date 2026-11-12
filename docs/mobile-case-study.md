# Mobile case study: the analytics dashboard

Written 12 Nov 2026 from the live dashboard at 390 px wide (a normal phone), page by page, and from the code.
Audience: the owner, who reads this on a phone and is not technical.

## 1. Who uses it and what they actually need

One person, on a phone, a few times a week. The questions are plain:

1. **"Is everything OK?"** Are the sites alive, is anything broken, did something change?
2. **"Is it growing?"** How many people came, where from, is Google sending anyone?
3. **"What should I do today?"** Which page to submit to Google, which link to share, which job failed.

The dashboard answered none of these in its first screen. It showed numbers and left the reading to the visitor.

## 2. What is there today (the inventory)

12 pages, each 3 to 8 phone screens tall (1,300 to 7,000 px). A bottom bar shows 5 of them; 7 hide behind "More".

| Page | Phone height | What it holds |
|---|---|---|
| Overview | 5,060 px | online now, 4 numbers, a short summary, 4 charts, 12 site cards |
| Sources | 6,617 px | donut, 5 ranked lists, filters |
| Pages | 3,474 px | top pages |
| Leads | 3,048 px | 8 event counters, funnel, per-day chart |
| Search (Google) | 1,903 px | clicks, impressions, CTR, position, query list |
| Audience | 6,154 px | world map, countries, Clarity table |
| Rankings | 5,265 px | tracked phrases, quick wins |
| Index health | 6,963 px | 12 site cards, Bing figures, the "copy link" tool |
| Live now | 3,471 px | last 30 minutes |
| Jobs | 5,357 px | 20 automation jobs with run history |
| Google Ads | 1,348 px | ads figures |
| Tools | 3,371 px | share-link builder |

## 3. The gaps (what makes it confusing)

### G1. No answer at the top
The first screen is "216 online now" and four numbers. Nothing says "good", "bad" or "look here". The one plain-words card ("In plain words") sits below the fold on a phone. **Missing: a verdict and a short list of what needs attention.**

### G2. Words nobody explained
Impressions, CTR, position, engaged, key events, direct / unknown, (not set), indexed, crawled, bots, rage clicks, "Rankings and quick wins". A phone has no hover, so title-tooltips never show. **Missing: tap-to-explain next to every unusual word, in everyday language, with "is this good?".**

### G3. Navigation named after tools, not questions
"Sources", "Pages", "Leads", "Health", "Jobs", "Tools" say what a screen is made of, not what it answers. Seven of the twelve are hidden under "More". Related screens (Search, Rankings, Index health) sit in different places. **Missing: a few big groups named after the questions in section 1, with the related screens one tap apart.**

### G4. The job you do most is buried and unexplained
Getting a page into Google is the real routine: copy a page link, paste it into Search Console's URL inspection, press Request indexing. It lives at the bottom of "Index health" as "Copy link" buttons with one sentence of help. Nothing says where Search Console is, which box to paste into, or how many pages are worth doing per day. **Missing: a step-by-step "Get pages into Google" screen with a button that opens Search Console already pointed at the page.**

### G5. Filters that do not fit the page
Site, date range and a "Compare" tick appear on every page, including Jobs, Index health and Tools where they change nothing. "Compare" means "show change against the period before", but it never says so. On a phone the filter row eats the first screen. **Missing: show a filter only where it works; say what it does.**

### G6. You cannot tell how fresh the numbers are
"Live" or "Saved copy" text is hidden on small screens (`hidden sm:inline`). On a phone there is only a green dot. **Missing: one plain line, "Updated 5 minutes ago", and a clear refresh button.**

### G7. Numbers that look wrong are not flagged
After a test run, "Esports Hub: 205 online now" appeared next to "2 visits this week". The page showed it without comment. **Missing: a sanity note when a number is far out of line, so the owner is not frightened or misled.**

### G8. Long pages, repeated blocks
Twelve identical site cards, five ranked lists and four charts per page. The most useful block is often six screens down. **Missing: lead with the answer, keep detail one tap lower.**

### G9. Technical text on non-technical pages
Jobs shows workflow names, UTC times and "Status only: a re-run would publish a real post". Rankings cites a file path (`worker/src/insights.js`). **Missing: plain labels, local (India) time, and an "all fine / something failed" line first.**

### G10. No place to learn
No glossary, no "how to read this". **Missing: a Help page and a "What am I looking at?" line under every page title.**

## 4. What we will change (and what we will not)

Kept as is: the data pipeline, the Worker, the charts, the desktop sidebar. Every existing screen stays reachable.

Added or changed, in this order:

1. **Today** becomes the first screen: a one-sentence verdict, up to five "needs your attention" cards each with a button that goes to the fix, and a compact list of the sites with a plain status chip.
2. **Navigation by question**: Today, Visitors, Google, To do, More. Related screens appear as chips under the title.
3. **Get pages into Google**: a five-step walk-through with copy and "Open Search Console" buttons.
4. **Tap-to-explain** on the confusing words, plus a Help page (glossary).
5. **"What is this page?"** one-liner under every page title.
6. **Filters only where they work**, with "Compare with before" spelled out.
7. **Freshness line** visible on phones.
8. **Sanity notes** on odd numbers.
9. **Plain Jobs summary** first, local time.

## 5. How we will know it worked

A person who has never seen it can, within 10 seconds of opening it on a phone, say: whether the sites are fine, whether visitors went up or down, and what to do next. Checked with phone-size screenshots after the build.

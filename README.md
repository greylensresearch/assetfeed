# AssetFeed

A daily-refreshing dashboard of global asset seizures, forfeitures, and freezes — vehicles, watercraft, airplanes, rotorcraft, properties, financial instruments, and crypto — pulled from public agency feeds and news wires. Static site, zero paid services.

## How it works

- `data/sources.json` — the list of feeds to monitor. Mix of direct agency RSS feeds (DOJ, Europol, UK NCA) and Google News RSS search queries that fill in global coverage where an agency has no public feed of its own.
- `scripts/fetch.mjs` — fetches every feed, keeps only items that read as an actual seizure/forfeiture (filters out noise like "seized the lead in the game"), sorts each into one of the seven categories, and merges the result into `data/seizures.json`. Items roll off after 60 days.
- `index.html` / `style.css` / `app.js` — the static dashboard. It just reads `data/seizures.json` — no backend, no build step.
- `.github/workflows/update-feed.yml` — runs the fetch script once a day on GitHub's free Actions runners and commits the updated JSON back to the repo.

Because GitHub Pages serves straight from the repo, a commit from the Action is all it takes for the live site to update the next time someone loads it.

## Setup

1. Push this repo to GitHub.
2. **Enable Pages**: Settings → Pages → Source → Deploy from a branch → `main` / root. (Or import the repo into Vercel — no config needed, it's a static site.)
3. **Enable Actions**: Actions are on by default for public repos. Nothing else to configure.
4. Optional: run `Actions → Update AssetFeed data → Run workflow` once by hand so the feed has real data immediately instead of waiting for the next scheduled run.

That's it — no API keys, no environment variables, no database.

## Local development

```bash
npm install
npm run fetch      # populates data/seizures.json
python3 -m http.server 8000   # or any static file server
```

Then open `http://localhost:8000`.

## Editing sources

Add, remove, or adjust feeds in `data/sources.json`. Two kinds:

- `"kind": "rss"` — a direct feed URL (agency press room, RSS 2.0 or Atom).
- `"kind": "google_news"` — a Google News RSS search query, useful for countries or agencies without their own public feed. Query syntax supports quotes and `OR`.

If you add a source that turns out to have a lot of noise, the fastest fix is usually to add a negative pattern to `NEGATIVE_RE` in `scripts/fetch.mjs`, or narrow the source's `query`.

## Changing the schedule

Edit the `cron` line in `.github/workflows/update-feed.yml`. It's in UTC. The default is `15 6 * * *` (06:15 UTC daily).

## Notes on coverage

The official feeds (DOJ, Europol, NCA) are high-signal but only cover their own jurisdiction. The Google News queries are broader but noisier — the keyword + seizure-language filter in `fetch.mjs` is doing the real work of keeping the feed relevant. Expect to tune `NEGATIVE_RE` and the category keyword lists over the first few weeks as you see what slips through.

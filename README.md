# Trip Planner v2

A trip planner that runs entirely in your browser, hosted free on GitHub Pages.
There is no server: your trip lives in your browser's storage (and, from phase 2, in a
secret GitHub Gist so your phone and laptop stay in sync).

Live site, once set up: `https://ngerver1.github.io/TravelPlanner/`

## What's built so far

| Phase | What | State |
| --- | --- | --- |
| 1 | Foundation: calendar, days list, flights, stays, warnings, export/import, v1 import | **Done** |
| 2 | Gist sync between devices | Next |
| 3 | Pools of ideas per city, drag and drop onto days, phone layout | Later |
| 4 | Google Places search and maps | Later |
| 5 | Train/bus legs, travel times, flight number lookup | Later |

## One-time setup: turn on GitHub Pages

You only do this once.

1. Open the repository on GitHub: `https://github.com/ngerver1/TravelPlanner`.
2. Click **Settings** (top bar), then **Pages** (left sidebar).
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
   (Not "Deploy from a branch".)
4. That's it. Every time code lands on the `main` branch, GitHub builds the app and
   publishes it. You can watch it under the **Actions** tab; a green tick means it's live.
   To publish again without a code change: **Actions → Deploy to GitHub Pages → Run workflow**.

## Moving your trip over from v1

1. In the old (v1) planner, click **⇅ Backup → Export JSON** and save the file.
2. In v2, click **⇅ Backup → Choose JSON file…** and pick that file.
3. Check the summary ("Old v1 file, will be converted…") and click **Replace trip**.

What the conversion does:

- Every place name used in your stays and day locations becomes a location
  ("sapporo" and "Sapporo" count as the same place).
- Food items become **places to eat**, filed under breakfast (before 11:00),
  lunch (before 16:00, or no time) or dinner.
- Everything else becomes a **thing to do**, filed under morning (before 12:00),
  afternoon (before 17:00) or evening. Times are kept.
- Each item belongs to the place you were on that day. Items with no day, or on a day
  with no location, go under **Unassigned**.
- Flights, stays, statuses, notes, links and confirmation numbers come across unchanged.

## Backups

**⇅ Backup → Download JSON** saves the whole trip as one file. Do this before big
changes, or every so often while you're travelling. Importing a file always asks before
replacing anything.

Your data lives in this browser only (until phase 2). Clearing the browser's site data,
or using a private window, means starting empty, so keep a backup.

## Things that never happen

- Changing the trip dates never deletes anything. Stays, flights, items or notes that end
  up outside the dates are listed in a yellow warning with an **Extend trip** button.
- Nothing is ever deleted except when you press a **Delete** button and confirm.
- No sample data: a new trip starts empty.

---

## For developers

```bash
npm install
```

```bash
npm run dev
```

Opens on `http://localhost:5173/TravelPlanner/`.

```bash
npm test
```

```bash
npm run build
```

Layout:

- `src/domain/`: types, derive logic (auto location, nights, overlaps, out-of-range,
  colours), v1 migration, normalisation. No React. Unit tested with Vitest.
- `src/sync/`: local storage (Gist sync arrives in phase 2).
- `src/views/`: Calendar, Days.
- `src/components/`: chips, pills, forms, panels, dialogs.
- `.github/workflows/deploy.yml`: test, build and deploy to Pages on every push to `main`.

Routing is hash-only (`#calendar`, `#days`) so Pages needs no 404 rewrite.

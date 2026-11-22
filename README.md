# Trip Planner v2

A trip planner that runs entirely in your browser, hosted free on GitHub Pages.
There is no server: your trip lives in your browser's storage (and, from phase 2, in a
secret GitHub Gist so your phone and laptop stay in sync).

Live site, once set up: `https://ngerver1.github.io/TravelPlanner/`

## What's built so far

| Phase | What | State |
| --- | --- | --- |
| 1 | Foundation: calendar, flights, stays, warnings, export/import, v1 import | **Done** |
| 3 | Locations with ideas lists, Day planner with drag and drop, undo, phone layout | **Done** (built before 2) |
| 2 | Gist sync between devices | Next |
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

## How it's organised

The bar at the bottom has five sections:

- **Plan**: your days, at three zoom levels (switch at the top):
  - **Calendar**: the whole trip at a glance: stays as coloured bars, flights, and red bars for nights with no stay.
  - **Overview**: one card per day with its location, flights, stay, and little markers for
    morning / afternoon / evening and breakfast / lunch / dinner.
  - **Day**: one day in detail. Tap any day elsewhere to open it here.
- **Locations**: the places on the trip. Open one to see its dates, assign it to days, add a stay,
  and collect **things to do** and **places to eat**.
- **Stays** and **Flights**: your bookings.
- **Settings**: backup and restore (and, later, syncing and map keys).

### Planning a day

In **Day** view, the ideas for that day's location sit beside the day (on a phone, tap **💡 Ideas**).

- **Drag** an idea onto Morning, Afternoon or Evening (things to do) or Breakfast, Lunch or Dinner (places to eat).
  On a phone, press and hold for a moment, then drag.
- **Drop onto another item** to swap them (half-day and full-day things), or to put it just before it.
- **Drop onto a date** in the strip at the top to move it to that day.
- **Drop back onto the ideas** to take it off the day. Nothing is deleted.
- Don't want to drag? Use **+** on a slot or meal, or **⋯** on any item ("Move to…").
- Every move shows a message with **Undo** (the last 20 changes can be undone).
- A full-day item fills morning and afternoon; a slot with too much in it is marked
  **Over capacity**, but nothing is ever blocked.
- Places to eat can be options on several days. Tap the circle on one to make it the pick for that meal.

## Moving your trip over from v1

1. In the old (v1) planner, click **⇅ Backup → Export JSON** and save the file.
2. In v2, open **⚙ Settings → Choose JSON file…** and pick that file.
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

**⚙ Settings → Download JSON** saves the whole trip as one file. Do this before big
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
- `src/domain/plan.ts`: placing, moving, swapping, ordering and slot capacity.
- `src/views/`: Month (Calendar), Overview, DayView, Locations, Settings.
- `src/components/`: chips, pills, forms, panels, dialogs.
- `.github/workflows/deploy.yml`: test, build and deploy to Pages on every push to `main`.

Routing is hash-only (`#calendar`, `#overview`, `#day/2027-01-24`, `#locations`, `#location/<id>`, `#stays`, `#flights`, `#settings`) so Pages needs no 404 rewrite.

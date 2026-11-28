# Trip Planner v2

A trip planner that runs entirely in your browser, hosted free on GitHub Pages.
There is no server: your trip lives in your browser's storage (and, from phase 2, in a
secret GitHub Gist so your phone and laptop stay in sync).

Live site, once set up: `https://ngerver1.github.io/TravelPlanner/`

## What's built so far

| Phase | What | State |
| --- | --- | --- |
| 1 | Foundation: calendar, flights, stays, warnings, export/import, v1 import | **Done** |
| 3 | Locations with ideas lists, Day planner with drag and drop, undo, phone layout | **Done** |
| 2 | Sync between phone and laptop through a secret GitHub Gist | **Done** |
| 4a | Google Maps links: Map link on everything, paste-a-link places, directions for each day | **Done** (no key needed) |
| 4b | In-app maps and place search (needs a Google Cloud key) | When you have a key |
| 5 | Train/bus legs, travel times, flight number lookup | Later |
| 6 | Works offline, installable on your phone's home screen | **Done** |
| 7 | Local-language names and addresses, full-screen "Show local" card for taxis | **Done** |

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

- **Today**: the day you're on, in time order, with a **Today | Tomorrow** switch (check tomorrow at the
  end of the day). It shows:
  - **the plan**: flights, transport, check-in/out and your plans by time. Plans without a time sit at their
    part of the day's usual time, marked `~`. Earlier items fade, and a **Now** line shows where you are.
  - **Tonight**: the hotel with check-in/out, phone, confirmation (tap Copy) and **文 Take me to my hotel**;
    or NO STAY with an Add button.
  - **Heads up**: anything unsorted today or tomorrow (no stay, no transport, not booked yet), and what
    tomorrow starts with.

  - **Weather** for the day's place (both places on a travel day): icon, high/low, chance of rain or snow,
    and an hour-by-hour row.
  - **To do today**: that day's checklist. Add to-dos here or in Day view; tick them off.

  Before the trip it counts down, lists what's **still to book**, keeps a **Before you go** checklist (with
  optional "by" dates; overdue ones turn red), and shows day 1. Anything not ticked by the time the trip starts
  sits under Today until it is. Afterwards it sums the trip up. During the trip dates the app opens on Today;
  otherwise it reopens where you left off. Checklists sync with the trip.
- **Plan**: your days, at different zoom levels (switch at the top):
  - **Calendar**: the whole trip at a glance: stays as coloured bars, flights, and red bars for nights with no stay.
  - **Overview**: one card per day with its location, flights, stay, and little markers for
    morning / afternoon / evening and breakfast / lunch / dinner.
  - **Day**: one day in detail. Tap any day elsewhere to open it here.
  - **Map**: everything with a map position.
- **Bookings**: **Stays**, **Travel** (flights and other transport together) and **Costs**, as tabs. The red
  number counts nights with no stay plus moves with no transport.
- **Places**: the places on the trip. Open one to see its dates, assign it to days, add a stay,
  and collect **things to do** and **places to eat**.
- **More**: settings (sync, Google Maps key, backup and restore, appearance, app version), and the **Inbox**
  of booking emails when there's something to review.

### Planning a day

In **Day** view, the ideas for that day's location sit beside the day (on a phone, tap **Ideas**).

- **Drag** an idea onto Morning, Afternoon or Evening (things to do) or Breakfast, Lunch or Dinner (places to eat).
  On a phone, press and hold for a moment, then drag.
- **Drop onto another item** to swap them (half-day and full-day things), or to put it just before it.
- **Drop onto a date** in the strip at the top to move it to that day.
- **Drop back onto the ideas** to take it off the day. Nothing is deleted.
- Don't want to drag? Use **+** on a slot or meal, or the **⇄ Move** button on any item. **⋯** opens the full editor; tapping the item shows its details with clickable links (website, Google Maps, links in notes, its days) and an **Edit** button.
- Adding an idea (on a location page, in the ideas list, or with **+**) opens the full editor, already filled in; nothing is added until you press **Save**.
- Every move shows a message with **Undo** (the last 20 changes can be undone).
- A full-day item fills morning and afternoon; a slot with too much in it is marked
  **Over capacity**, but nothing is ever blocked.
- Places to eat can be options on several days. Tap the circle on one to make it the pick for that meal.

## Syncing your phone and laptop

The trip is saved in a **secret Gist** (a single file, `trip.json`) on your GitHub account.
Each device keeps its own copy too, so the app works offline and catches up when it's back online.

### 1. Create a token (once)

1. On your laptop, sign in to GitHub and open
   [github.com/settings/tokens/new?scopes=gist](https://github.com/settings/tokens/new?scopes=gist&description=Trip%20Planner).
   (That's **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**.)
2. **Note:** `Trip Planner`.
3. **Expiration:** pick a date after you get home from the trip. (When it expires the app says
   "Token invalid"; just make a new one.)
4. **Scopes:** tick **gist** only. Nothing else.
5. Click **Generate token** and copy it (it starts with `ghp_`). GitHub shows it only once.
   You can paste it into a note on your phone for step 2, then delete the note.

### 2. Connect each device

1. Open the app → **More → Settings → Sync between devices**.
2. Paste the token and tap **Connect**.
3. First device: tap **Create a new secret Gist with this trip**.
   Other devices: tap the trip in the list ("Trips already in your Gists").
   If both the device and the Gist have a trip, it asks which one to keep.

That's it. The little status in the top right shows:

| Status | Meaning |
| --- | --- |
| **Saved** (green dot) | In step with the Gist. |
| **Syncing…** | Saving (about 2 seconds after your last change) or checking for changes. |
| **Offline** | No connection. Changes are kept on this device and sent when you're back online. |
| **Conflict** | You changed the trip on two devices without them syncing in between. The app asks which version to keep and never overwrites without asking. **Download both** keeps a copy of each. |
| **Token invalid** | The token expired or was deleted. Settings → Disconnect, then connect with a new token. |
| **This device** / **On this device only** | Sync isn't set up on this device. |

The app checks for changes from other devices when you open it and whenever you come back to it.

### Good to know

- **A secret Gist is unlisted, not private.** It doesn't show on your profile or in searches,
  but anyone who has its exact web address can read it, including booking confirmation numbers.
  Don't share the Gist's link.
- **The token stays on the device** where you pasted it (in the browser's storage). It is never
  in the app's code, the website address or the Gist. Use **Disconnect this device** to remove it.
- **It's single-user.** Sharing the trip with someone else would mean giving them a token to your
  GitHub account, so don't. Shared editing would need a different setup later.
- Clearing the browser's data removes the token and the local copy; the Gist still has the trip.
  Reconnect and pick it from the list.

## Maps

No Google account or key needed for any of this:

- **Map** (small pin link) on every idea and stay opens Google Maps. If you've pasted a link it goes
  straight to that place (pin shown in blue); otherwise it searches for the name plus the city.
- **Paste a Google Maps link** into an idea or stay (in Google Maps: **Share → Copy link**).
  The place name fills in, and if the link contains the map position it's saved too, ready for an
  in-app map later. Short `maps.app.goo.gl` links are kept as links (their position can't be read
  from the browser), which still open the exact place.
- **Directions for this day** (Day view) opens Google Maps with last night's stay → the day's stops
  in order (breakfast, morning, lunch, afternoon, dinner, evening) → tonight's stay. Google Maps
  takes up to 9 stops in between.

## Transport

- **+ Add transport** (Travel page) for trains, buses, ferries, hire cars and transfers: operator or
  service, from and to (typed names, plus the trip locations at each end), date and times (arrival
  can be the next day), status, confirmation number, booking link, price and notes.
- If the two locations differ, it's a **travel day** like a flight: it sets the day's location,
  splits the day's colour stripe by time, and an overnight ferry/bus/train counts as somewhere to sleep.
- **Link it to a thing to do or a place to eat** ("Getting there" or "Getting back"): it then shows
  right before or after that item in Day view, and in the item's view. You can also add it from the
  item's view (**+ Getting there**).
- **NO TRANSPORT** (red, like NO STAY) marks a day where your location changes with no flight or
  transport booked, including waking up somewhere new. Tap it to add a booking already filled in.
  The Travel page lists these days at the top, and the Travel button shows how many.
- Tapping a booking shows it with **Directions** (Google Maps public transport, or driving for a car),
  the booking link and a copyable confirmation number.

## Email inbox (forward bookings)

Forward booking confirmations (flights, hotels, transport, restaurants, tours, tickets) to
**trips@aleagueapart.com**. They appear under **📥 Inbox** (top of the app) for you to review:
**Add** (opens the right editor, already filled in), **Update existing** (when the confirmation number or flight
matches something already in the trip), or **Dismiss**. Nothing goes into the trip on its own. Emails that
couldn't be read keep their text so you can add them by hand.

Setup (once, free): see [`email-worker/SETUP.md`](email-worker/SETUP.md). Needs sync set up, because the inbox
lives in the same Gist.

## Costs

- **Prices:** stays, flights, things to do and places to eat each have an optional **amount and currency**
  (in their editors). Flights, things to do and food can be **per person**; stays are for the whole stay.
- **Bookings → Costs** shows:
  - the **trip total** in your home currency, split into booked / planned / idea;
  - totals **by type** (stays, flights, transport, things to do, food) and **by location**;
  - every costed thing, with its original price;
  - what has **no cost yet**, and ideas not on a day (not counted).
  - **Download CSV** gives a spreadsheet of everything in the total.
- **Home currency and travellers** are set at the top of the Costs page. "Per person" prices are
  multiplied by the number of travellers.
- **Exchange rates** come from the European Central Bank's daily reference rates (via Frankfurter, free,
  no key, nothing personal sent). They're fetched when a new currency appears, or with **Update rates**.
  You can type your own rate over any of them (e.g. what your card actually charged); yours are kept
  when rates update. Rates are saved with the trip, so they sync to your other devices.
- **What counts:** stays, flights, things to do that are on a day, and places to eat on days where
  they're the pick (or the only option for that meal).
- Old text costs (like "HK$4,200" on a v1 stay) were converted to amounts automatically; anything that
  couldn't be read is kept as a note in the stay's editor.

### Map (no key needed)

- **Google maps without a key:** each idea's and stay's view shows an embedded Google map of the place
  (found by its name and city, or its exact position if it has one — so Google links and plain names
  both work). Flights show the departure and arrival airports; transport shows its route.
- **Route & map** (Day view) is the day in Google Maps:
  - an embedded map of the whole day;
  - **Whole day in Google Maps: Walking / Driving** opens every stop as one route in the Google Maps app;
  - **each hop** (e.g. "Snow Lodge → Ski lesson") has **Transit ↗** and **Walk ↗**. Google Maps only does
    public transport one hop at a time, so this is how to see trains and buses between your plans.
- **Route & map** and **Map → a day** show the day on Google Maps with directions:
  last night's hotel (or the arrival airport after a flight) → the day's stops in order → tonight's
  hotel (or the departure airport before an overnight flight). Up to 10 stops.

- **Plan → Map → Everything / a location** pins everything that has a map position on a Google map (needs your
  Google Maps key, below): ideas as dots in their location's colour
  (solid = on a day, hollow = still an idea) and stays as 🛏. Choose **Everything**, **a location** or
  **a day** (a day shows its stops numbered in order, joined from hotel to hotel). Tap a pin to open it.
- **Giving something a position:** in an idea's or stay's editor, tap **Find on map** (searches
  Google by name and city; pick the right result; needs the key), or paste a long Google Maps link from a
  computer. Short `maps.app.goo.gl` share links don't include the position.
- Without a key, the Map tab says it needs one, and Find on map and Get local name are switched off. Everything
  above that says "no key needed" keeps working.

### Google Maps with your own key (free, capped)

With a key, the **Map** tab is a real Google map with your pins, **Find on map** searches Google (and remembers the
exact Google place), and **Get local name** asks Google for the place's name and address in Japanese or Chinese.
Everything else (the embedded maps, Map links, directions) already uses Google and needs no key.

The key is **saved with the trip**, so it syncs through your Gist and your other devices pick it up (you chose
this for this key only; the GitHub token is never synced). That means anyone who could read your Gist could copy the
key, so **only save a key that is website-restricted, API-restricted and capped** (steps 1 and 2 below): restricted
like that, it only works on your app, only for maps and place search, and only up to your daily limits. Google only
charges above a free monthly allowance; the caps keep you far under it.

**1. Make the key** (on a computer, about 10 minutes)

1. Go to **console.cloud.google.com** and sign in. Create a project, e.g. "Trip Planner".
2. **Billing:** Google requires a billing account (a card) even for free use. Link one to the project.
3. **APIs & Services → Library:** enable **Maps JavaScript API** and **Places API (New)**.
4. **APIs & Services → Credentials → Create credentials → API key.** Then edit the key:
   - **Application restrictions → Websites:** add `https://ngerver1.github.io/*` (only your app can use it).
   - **API restrictions → Restrict key:** tick **Maps JavaScript API** and **Places API (New)** only.

**2. Cap it so it can't cost money**

1. **APIs & Services → Places API (New) → Quotas:** set the per-day limits for text search and place details
   requests to about **100 per day**.
2. **APIs & Services → Maps JavaScript API → Quotas:** set map loads per day to about **200**.
3. **Billing → Budgets & alerts:** add a budget of **A$1** with email alerts, so you'd hear about any charge.
   (Budgets only warn; the quotas are what stop use.)
4. Check the current free monthly allowance on Google's **Maps Platform pricing** page: the caps above are far
   below it.

**3. Add it to the app**

1. **More → Settings → Google Maps:** paste the key (starts with `AIza`) and tap **Save**. Settings shows
   **Saved with the trip: …last 4**.
2. Tap **Test key**: it should say "Works: found Tokyo Station". If Google refuses it, check the website
   restriction and that both APIs are enabled.
3. Your other devices get it at their next sync (open the app, or Settings → Sync now). A key that was saved on
   a device only, before keys synced, keeps being used on that device; Settings shows it and offers
   **Save it with the trip**.
4. **Remove key** clears it from the trip, so it's gone from every device after their next sync.
5. **Download JSON / Copy JSON** leave the key out. Tick **Include the Google Maps key** if you want it in the
   file (you'll see a warning): don't share that file.

What uses it: opening the **Map** tab (one map load), **Find on map** (one search per tap) and **Get local
name** (one request per tap). Nothing runs in the background. Offline, maps show "Map not available offline".

## Moving your trip over from v1

1. In the old (v1) planner, click **⇅ Backup → Export JSON** and save the file.
2. In v2, open **More → Settings → Choose JSON file…** and pick that file.
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

## Local names: show a taxi driver where you're going

Stays, places to eat, things to do and transport stops can hold the place's **name and address in the local
language** (Japanese, Chinese or Korean). Anything with one gets a **文** button that opens a full-screen card:
the local name at the top, the address as large as fits, the English name small underneath, and a call button
if there's a phone number. Black on white, even in dark mode, and it keeps the screen on while it's open.

### Filling it in

- **From emails:** forward the booking as usual. Japanese hotel and restaurant emails often include the name and
  address in Japanese; the reader copies them exactly (it never translates) and the Inbox shows them next to 文.
  Add or Update fills them in.
- **Get local name:** in a stay's or idea's editor, under the address, tap **Get local name**. It asks Google Maps
  for the place in the local language (日本語 for Japan, 繁體中文 for Hong Kong: change it in the little menu if
  needed) and shows what it found. Tap **Use this** or **Ignore**. Using **Find on map** first gives the exact
  place. One request per tap; nothing is looked up by itself. Needs the Google Maps key.
- **Paste it:** copy the name and address from the booking, the hotel's website or Google Maps (switch Google Maps
  to Japanese to see them) and paste them into the two boxes.

### Using the card

- Tap **文** on a place in the Day view, in its details (**文 Show local**), on a stop under **Route & map**, or
  **文 Take me to my hotel** at the top of each day.
- It's drawn in landscape: with the phone upright, the card appears sideways, so turn the phone to the left to
  read it. The phone's own rotation setting is never changed, and nothing goes full screen. If the phone is already
  sideways, the card is drawn normally. Turn this off in **More → Settings → Open local card in landscape**.
- Close it with **✕**, by swiping down, or with the phone's Back button.
- It works offline: it only uses what's saved in your trip.

## Weather

Forecasts come from **Open-Meteo** (free, no key or account). They show on **Today**, in each day's header in
**Day view**, and as a **7-day forecast** on each place's page.

- Forecasts reach about 16 days ahead; before that a day shows "Forecast from …".
- The app asks for weather only when one of those screens is open, at most every 3 hours, and only sends map
  positions. A place's position comes from its own map position, else its hotel's, else an idea there; a place
  with none is looked up by name once (Open-Meteo's place search).
- The last forecast is kept on the device, so it still shows offline (with "as of …" once it's old).

## Install on your phone and use it offline

Once installed, the app opens from your home screen like a normal app and shows your whole trip
with no internet: days, bookings, confirmation numbers, notes, costs and inbox items you have
already loaded. Open it once online first so it can save itself on the phone.

### Android (Chrome)

1. Open `https://ngerver1.github.io/TravelPlanner/` in Chrome.
2. Tap **⋮** (top right) → **Install app** (on some phones it says **Add to Home screen**).
3. Tap **Install**. A **Trip Planner** icon (hotel and plane on blue) appears on your home screen.

### iPhone (Safari)

1. Open `https://ngerver1.github.io/TravelPlanner/` in **Safari** (it has to be Safari).
2. Tap the **Share** button (square with an arrow) → **Add to Home Screen**.
3. Tap **Add**. Open it from the **Trip Planner** icon from then on: the home-screen app keeps its own
   copy of your trip, separate from the Safari tab, so connect sync in it too
   (More → Settings → paste your token).

### Check it works offline

1. Open the app from the home screen while online and wait for the sync chip to say **Saved**.
2. Turn on aeroplane mode, close the app fully, then open it again from the home screen.
3. Your trip should appear, with the sync chip showing **Offline · changes kept on this device**.
4. Make a small edit, then turn aeroplane mode off. Within a few seconds the chip changes to
   **Saved**: your edit has gone to the Gist.

### Good to know

- **Needs internet:** maps (they show "Map not available offline"), Find on map, exchange-rate
  updates and new emails arriving in the Inbox. Everything else works offline.
- **Edits made offline** stay on the phone and sync as soon as you're back online. If you also
  edited on another device in the meantime, you'll get the usual conflict choice.
- **Updates:** when a new version is published, a bar says **Update available, tap to refresh**.
  Tap it to switch over, or ✕ to keep going and update later.
- Nothing extra is stored anywhere: the offline copy is the app's own files, kept by the browser.

## Backups

**More → Settings → Download JSON** saves the whole trip as one file. Do this before big
changes, or every so often while you're travelling. Importing a file always asks before
replacing anything.

Without sync, your data lives in that browser only: clearing the browser's site data, or using a
private window, means starting empty. With sync set up, the Gist has a copy, but a downloaded
backup is still worth keeping before big changes.

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
- `email-worker/`: the Cloudflare Email Worker (reads forwarded bookings into the Gist's `inbox.json`); `src/domain/inbox.ts` holds the shared booking format, markup reader and matching.
- `src/sync/`: local storage, the Gist client (`gist.ts`), sync rules (`decide.ts`, tested) and the sync hook (`useSync.ts`).
- `src/domain/plan.ts`: placing, moving, swapping, ordering and slot capacity.
- `src/views/`: Month (Calendar), Overview, DayView, Locations, Settings.
- `src/components/`: chips, pills, forms, panels, dialogs.
- `.github/workflows/deploy.yml`: test, build and deploy to Pages on every push to `main`.

Routing is hash-only (`#calendar`, `#overview`, `#day/2027-01-24`, `#locations`, `#location/<id>`, `#stays`, `#flights`, `#settings`) so Pages needs no 404 rewrite.

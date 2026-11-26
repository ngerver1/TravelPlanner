# Email inbox setup: trips@aleagueapart.com

Forward booking confirmations to **trips@aleagueapart.com** and they appear in the app's **Inbox** (📥 at the
top of the app) for you to **Add**, **Update existing** or **Dismiss**. Nothing goes into the trip on its own.

How it works:

1. **Cloudflare Email Routing** (free) receives mail for trips@aleagueapart.com.
2. A small **Cloudflare Worker** (this folder) checks the email came from **your own address**, and rejects
   anything else.
3. It reads the booking: first from the booking details some companies hide in their emails (airlines, hotels,
   booking sites), then with **Cloudflare Workers AI** (free allowance), and if neither works it keeps the email
   text for you to fill in by hand.
4. It adds the result to `inbox.json` in the same secret Gist as your trip. The app picks it up next time it syncs.

Total cost: **free** (Cloudflare free plan; you already own the domain).

You'll need: your Cloudflare login (or 5 minutes to create one), your domain registrar login, and the GitHub
token you made for syncing (or a new one, see step 4). Allow about 45 minutes the first time, mostly waiting.

---

## Step 0. Check the domain first (2 minutes) ⚠

Before changing anything, check two things about aleagueapart.com. Open these two links in your browser; each
shows a short block of text.

**A. Where is the DNS managed?** Open
https://dns.google/resolve?name=aleagueapart.com&type=NS
and look at the `"data"` values under `"Answer"`.

- If they end in **`.ns.cloudflare.com`**: it's already on Cloudflare. **Skip step 2.**
- Anything else (e.g. `ns1.ventraip.net.au`, `domaincontrol.com`, `squarespacedns.com`): it's at your registrar
  or web host. Do step 2.

**B. Does the domain already receive email?** Open
https://dns.google/resolve?name=aleagueapart.com&type=MX

- **No `"Answer"` section** (only `"Authority"`): the domain doesn't receive email now. Carry on with
  **trips@aleagueapart.com** as planned.
- **There is an `"Answer"` with MX records** (e.g. `aspmx.l.google.com`, `*.mail.protection.outlook.com`,
  your host's mail server): **the domain already receives email. Stop here and tell Claude.**
  Turning on Cloudflare Email Routing for the main domain replaces those records, and that email would stop
  arriving. The safe alternative is a subdomain address such as **trips@mail.aleagueapart.com**, which leaves
  your existing email alone. Claude will adjust these steps.

---

Cloudflare and Gmail occasionally rename menus. If a label below doesn't match exactly, look for the nearest equivalent.

## Step 1. Cloudflare account

1. Go to https://dash.cloudflare.com/sign-up and create a free account (or log in).
2. Turn on two-factor authentication: profile icon (top right) → **My Profile** → **Authentication**.

## Step 2. Move the domain's DNS to Cloudflare (only if step 0A said so)

Your website keeps working: Cloudflare copies your existing DNS records. This step only changes *who answers*
for the domain.

1. In the Cloudflare dashboard: **Add a domain** (or **+ Add** → **Connect a domain**). Enter `aleagueapart.com`.
2. Choose the **Free** plan.
3. Cloudflare scans your existing DNS records and shows a list. **Check it against your current records** before
   continuing: log in to your registrar/host, open the DNS settings for aleagueapart.com, and make sure every
   record there (especially `A`, `AAAA` and `CNAME` records for `aleagueapart.com` and `www`) also appears in
   Cloudflare's list with the same value. Add any that are missing with **Add record**.
   - If unsure whether to keep the orange cloud ("Proxied") on your website records, switching them to
     **DNS only** (grey cloud) keeps the website behaving exactly as it does now.
4. Continue. Cloudflare shows **two nameservers** (like `ada.ns.cloudflare.com` and `rob.ns.cloudflare.com`).
5. At your **registrar** (where you bought the domain): find **Nameservers** for aleagueapart.com, choose
   **custom nameservers**, and replace the existing ones with Cloudflare's two. Save.
   - For a `.com` domain bought in Australia, this is usually under "Manage domain → Nameservers / DNS".
6. Back in Cloudflare, click **Check nameservers**. It can take from a few minutes to a few hours. Cloudflare
   emails you when the domain is **Active**. Check your website still loads.

To undo: put the old nameservers back at your registrar.

## Step 3. Deploy the Worker

Pick **one** of these.

### Option A, from the Cloudflare dashboard (no tokens needed; redeploys itself when the code changes)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** (Workers tab).
2. Connect GitHub when asked, and allow access to the **ngerver1/TravelPlanner** repository only.
3. Choose **TravelPlanner**, then set:
   - **Project name:** `trip-planner-email` (must match exactly)
   - **Root directory** (under Advanced/Build settings): `email-worker`
   - **Deploy command:** `npx wrangler deploy` (usually filled in already)
   - Leave the build command empty.
4. **Create and deploy**. Wait for the green tick.
5. Optional, recommended: in the Worker's **Settings → Build → Build watch paths**, set
   `email-worker/*` and `src/domain/inbox.ts`, so it only redeploys when the email code changes.

### Option B, from GitHub (uses the workflow in this repo)

1. Cloudflare → profile icon → **My Profile** → **API Tokens** → **Create Token** → use the
   **Edit Cloudflare Workers** template → **Continue to summary** → **Create Token**. Copy it.
2. Cloudflare → **Workers & Pages**: copy your **Account ID** (right-hand side).
3. GitHub → **ngerver1/TravelPlanner** → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**, twice:
   - `CLOUDFLARE_API_TOKEN` = the token from 1
   - `CLOUDFLARE_ACCOUNT_ID` = the ID from 2
4. GitHub → **Actions** → **Deploy email worker** → **Run workflow**. Wait for the green tick.

## Step 4. Give the Worker its three settings

These are the Worker's private settings. They live only in Cloudflare, never in the code or this repo.

1. Cloudflare → **Workers & Pages** → **trip-planner-email** → **Settings** → **Variables and Secrets** → **Add**.
2. Add each of these with **Type: Secret**:

   | Name | Value |
   | --- | --- |
   | `GITHUB_TOKEN` | Your GitHub token with the **gist** scope: the same one you pasted into the app's Settings, or make a new one the same way (see the main README, "Create a token"). |
   | `GIST_ID` | In the app: **⚙ Settings → Sync between devices → Copy Gist ID**. |
   | `ALLOWED_SENDERS` | Your Gmail address. To allow more of your addresses later, separate them with commas: `me@gmail.com, me@work.com` |

3. **Deploy** (or **Save and deploy**) so the Worker picks them up.

Workers AI needs no setting: the Worker's `wrangler.toml` already connects it.

## Step 5. Turn on Email Routing and create trips@aleagueapart.com

1. Cloudflare → your domain **aleagueapart.com** → **Email** → **Email Routing** → **Get started** / **Enable**.
2. Cloudflare offers to add its **MX** and **TXT (SPF)** records. Click **Add records and enable**.
   - ⚠ If it says it will **delete existing MX records**, stop: the domain already receives email (see step 0B).
3. **Routing rules** → **Custom addresses** → **Create address**:
   - **Custom address:** `trips`
   - **Action:** **Send to a Worker**
   - **Destination:** `trip-planner-email`
   - **Save**.

## Step 6. Test it

1. From your Gmail, send a short email to **trips@aleagueapart.com** (any subject, e.g. "Test", body "hello").
2. Open the trip app (or switch back to it). Within about a minute, **📥 1** appears at the top. Open it: the test
   email is there as "Not read automatically" with its text. **Dismiss email** removes it.
3. Now forward a real booking confirmation and review what it found.

If an email from another address is sent to trips@, it's **rejected** (the sender gets a bounce).

## Tips for forwarding from Gmail

- **Forward** works. Gmail usually removes the hidden booking details when you forward by hand, so those emails are
  read by the AI instead. That's fine, but double-check what it found.
- **Best results: auto-forward with a filter.** Auto-forwarded emails normally keep the hidden booking details.
  1. Gmail → ⚙ **See all settings** → **Forwarding and POP/IMAP** → **Add a forwarding address** →
     `trips@aleagueapart.com`.
  2. Gmail sends a confirmation code to that address. It arrives in the app's **Inbox** as
     "Gmail forwarding confirmation": open **Email text**, copy the code, and enter it in Gmail.
  3. Don't turn on "forward a copy of incoming mail" for everything. Instead create a **filter** (search box →
     options) for booking senders, e.g. `from:(cathaypacific.com OR booking.com OR jal.co.jp)`, and choose
     **Forward it to** trips@aleagueapart.com.

## Limits and privacy

- **Workers AI free allowance:** 10,000 "Neurons" a day (checked on Cloudflare's pricing page, Nov 2026).
  Reading one email uses roughly 200, so about **50 emails a day** for free. If it's ever used up, the email
  still arrives in the Inbox with its text, just not read automatically. It resets daily.
- **The AI model** is set in `wrangler.toml` (`AI_MODEL`). If Cloudflare ever retires it, pick another model
  that supports "JSON mode" from https://developers.cloudflare.com/workers-ai/features/json-mode/ and redeploy.
- **Where your email goes:** the email is processed by Cloudflare (Email Routing and Workers AI). Its text
  (trimmed) and the booking details are stored in `inbox.json` in your **secret Gist**. A secret Gist is unlisted,
  not private: anyone with its link could read it, so don't share the link. Reviewed or dismissed entries are
  removed from the file; at most the newest 100 are kept.
- **Only your addresses are accepted** (`ALLOWED_SENDERS`). The only exception is Gmail's
  forwarding-confirmation email (from `forwarding-noreply@google.com`), so you can read the code.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Your email bounced: "only accepts mail from its owner" | The address you sent from isn't in `ALLOWED_SENDERS` (step 4). |
| Email bounced with another error | Cloudflare → trip-planner-email → **Observability / Logs**. "GitHub 401" means the token expired: make a new one and update `GITHUB_TOKEN`. "GIST_ID not set" means step 4 was missed. |
| Nothing arrives and no bounce | Cloudflare → aleagueapart.com → **Email Routing** → **Activity log** shows whether the email was received and sent to the Worker. Check the `trips` rule's action is **Send to a Worker**. |
| Inbox doesn't show anything new | The app reads the inbox when it syncs: switch away and back, or ⚙ Settings → **Sync now**. Sync must be set up on that device. |
| Details look wrong | Bookings read by AI say "Read by AI: check the details". Fix them in the editor before you save. |

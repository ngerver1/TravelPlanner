# Email inbox setup: trips@aleagueapart.com

Forward booking confirmations to **trips@aleagueapart.com** and they appear in the app's **Inbox** (📥 at the
top of the app) for you to **Add**, **Update existing** or **Dismiss**. Nothing goes into the trip on its own.

How it works:

1. **Cloudflare Email Routing** (free) receives all email for aleagueapart.com:
   - **trips@** goes to a small **Cloudflare Worker** (this folder);
   - **nick@** is forwarded to your Gmail, exactly as Porkbun does today.
2. The Worker checks the email came from **your own address** and rejects anything else.
3. It reads the booking: first from the booking details some companies hide in their emails (airlines, hotels,
   booking sites), then with **Cloudflare Workers AI** (free allowance). If neither works it keeps the email text
   for you to fill in by hand.
4. It adds the result to `inbox.json` in the same secret Gist as your trip. The app picks it up next time it syncs.

Total cost: **free**. Like Porkbun's forwarding, Cloudflare Email Routing only **receives** email; it doesn't
let you send as nick@ (that would need a separate outgoing mail service).

**Your domain today** (checked 27 Nov 2026):

- DNS is managed by **Porkbun** (nameservers `*.ns.porkbun.com`).
- Email: Porkbun forwards **nick@** to your Gmail (MX records `fwd1/fwd2.porkbun.com`).

The steps below move the DNS to Cloudflare and recreate that forward there, in an order where nick@ keeps
working the whole time.

You'll need: your Porkbun login, a Cloudflare login (or 5 minutes to create one), and the GitHub token you made
for syncing (or a new one, see step 4). Allow about an hour the first time, mostly waiting for the DNS change.

Cloudflare and Porkbun occasionally rename menus. If a label below doesn't match exactly, look for the nearest
equivalent.

---

## Step 1. Cloudflare account

1. Go to https://dash.cloudflare.com/sign-up and create a free account (or log in).
2. Turn on two-factor authentication: profile icon (top right) → **My Profile** → **Authentication**.

## Step 2. Move the domain's DNS from Porkbun to Cloudflare

Your website and nick@ keep working: Cloudflare copies your existing DNS records, including Porkbun's two
email-forwarding records. This step only changes *who answers* for the domain.

**2a. Note your current records (Porkbun)**

1. Porkbun → **Domain Management** → aleagueapart.com → **DNS** (the "DNS Records" option).
2. Take a screenshot of the list. You'll compare against it in 2c.
3. Still in Porkbun, on the domain's details, check **DNSSEC**. If it's **on**, turn it **off** now, and wait
   an hour before 2d. (A nameserver change with DNSSEC on can make the domain stop resolving.) If it's off, carry on.

**2b. Add the domain to Cloudflare**

1. Cloudflare dashboard → **Add a domain** (or **+ Add** → **Connect a domain**). Enter `aleagueapart.com`.
2. Choose the **Free** plan.

**2c. Check the copied records**

Cloudflare shows the records it found. Compare with your Porkbun screenshot. Everything should be there with the
same values, in particular:

- the website records (`A`, `AAAA` or `CNAME` for `aleagueapart.com` and `www`);
- the two **MX** records: `fwd1.porkbun.com` (priority 10) and `fwd2.porkbun.com` (priority 20). **Keep these
  for now**: they keep nick@ working until step 5;
- any **TXT** records (e.g. one starting `v=spf1`).

Add anything missing with **Add record**. To keep the website behaving exactly as now, set the website records
to **DNS only** (grey cloud) rather than Proxied (orange cloud). You can change that later.

**2d. Switch the nameservers (Porkbun)**

1. Cloudflare now shows **two nameservers**, like `ada.ns.cloudflare.com` and `rob.ns.cloudflare.com`. Copy them.
2. Porkbun → **Domain Management** → aleagueapart.com → **Authoritative Nameservers** → **Edit**.
3. Delete the four Porkbun ones (`curitiba`, `fortaleza`, `maceio`, `salvador` `.ns.porkbun.com`) and enter
   Cloudflare's two. **Submit**.
4. Back in Cloudflare, click **Check nameservers**. It usually takes from a few minutes to a few hours, and
   Cloudflare emails you when the domain is **Active**.
5. Check your website still loads, and send a test email to nick@ from **another email account** (not your own
   Gmail, which can hide mail you send to yourself). It should still arrive in Gmail via Porkbun.

To undo at any point: put the four Porkbun nameservers back in Porkbun.

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

## Step 5. Turn on Email Routing: nick@ to Gmail, trips@ to the Worker

Only start this once the domain shows **Active** in Cloudflare (step 2d).

1. Cloudflare → **aleagueapart.com** → **Email** → **Email Routing** → **Get started** / **Enable**.
2. **Destination address** (where forwarded mail goes): add your **Gmail address**. Cloudflare emails it a
   verification link. Open Gmail and click **Verify email address**.
3. **Routing rules** → **Custom addresses** → **Create address**, twice:

   | Custom address | Action | Destination |
   | --- | --- | --- |
   | `nick` | **Send to an email** | your Gmail address |
   | `trips` | **Send to a Worker** | `trip-planner-email` |

4. **DNS records:** Cloudflare says Email Routing needs its own **MX** and **TXT (SPF)** records, and lists the
   existing ones it will remove: the two **`fwd1/fwd2.porkbun.com`** MX records, and possibly an old SPF TXT
   record mentioning porkbun. **This time that's expected**: nick@ is now forwarded by Cloudflare (row 1 above).
   Click **Add records and enable** (or **Enable email routing**).
5. Wait a few minutes, then test both addresses:
   - **nick@:** from **another email account**, send to nick@aleagueapart.com. It should arrive in Gmail. Check
     Spam the first time, and mark it "Not spam" if needed.
   - **trips@:** see step 6.

If nick@ doesn't arrive: Cloudflare → Email Routing → **Activity log** shows what happened. To roll back
quickly, delete Cloudflare's MX records and re-add `fwd1.porkbun.com` (priority 10) and `fwd2.porkbun.com`
(priority 20) in Cloudflare DNS: Porkbun's forward is still set up until step 7.

## Step 6. Test the trip inbox

1. From your Gmail, send a short email to **trips@aleagueapart.com** (any subject, e.g. "Test", body "hello").
2. Open the trip app (or switch back to it). Within about a minute, **📥 1** appears at the top. Open it: the test
   email is there as "Not read automatically" with its text. **Dismiss email** removes it.
3. Now forward a real booking confirmation and review what it found.

If an email from another address is sent to trips@, it's **rejected** (the sender gets a bounce).

## Step 7. Tidy up Porkbun

Once nick@ has worked through Cloudflare for a day or two:

- Porkbun → **Domain Management** → aleagueapart.com → **Email Forwarding**: delete the **nick@** forward
  (trash icon). It's no longer used, since mail now goes to Cloudflare, but removing it avoids confusion later.

Keep the domain **registered** at Porkbun as now (renewals stay there). Only the DNS moved.

## Tips for forwarding from Gmail

- **Forward** works. Gmail usually removes the hidden booking details when you forward by hand, so those emails
  are read by the AI instead. That's fine, but double-check what it found.
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
- **Where your email goes:** mail to the domain is processed by Cloudflare (Email Routing, and Workers AI for
  trips@). nick@ mail is only passed on to Gmail. For trips@, the email's text (trimmed) and the booking details
  are stored in `inbox.json` in your **secret Gist**. A secret Gist is unlisted, not private: anyone with its link
  could read it, so don't share the link. Reviewed or dismissed entries are removed from the file; at most the
  newest 100 are kept.
- **Only your addresses are accepted** at trips@ (`ALLOWED_SENDERS`). The only exception is Gmail's
  forwarding-confirmation email (from `forwarding-noreply@google.com`), so you can read the code.
- **Sending as nick@** isn't covered, as before with Porkbun. It needs a separate outgoing mail (SMTP) service.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Your email to trips@ bounced: "only accepts mail from its owner" | The address you sent from isn't in `ALLOWED_SENDERS` (step 4). |
| Email to trips@ bounced with another error | Cloudflare → trip-planner-email → **Observability / Logs**. "GitHub 401" means the token expired: make a new one and update `GITHUB_TOKEN`. "GIST_ID not set" means step 4 was missed. |
| Nothing arrives and no bounce | Cloudflare → aleagueapart.com → **Email Routing** → **Activity log** shows whether the email was received and where it went. Check the `trips` rule's action is **Send to a Worker**. |
| nick@ mail stopped arriving | Email Routing → Activity log. Check the `nick` rule and that the Gmail destination shows **Verified**. Also check Gmail's Spam folder. Roll back as described at the end of step 5. |
| Website stopped loading after step 2 | A website record wasn't copied. Compare Cloudflare DNS with your Porkbun screenshot and add it, or put Porkbun's nameservers back. |
| Inbox doesn't show anything new | The app reads the inbox when it syncs: switch away and back, or ⚙ Settings → **Sync now**. Sync must be set up on that device. |
| Details look wrong | Bookings read by AI say "Read by AI: check the details". Fix them in the editor before you save. |

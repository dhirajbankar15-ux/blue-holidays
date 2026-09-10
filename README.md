# Blue Jet Holidays

Marketing and lead-capture site for a holiday planning company based in Sangli
with an operations hub in Pune. One page, an Express backend that captures
enquiries, and no build step.

The site deliberately publishes **no prices**. Airfare and hotel category move
the cost of an identical itinerary too much for a price list to be honest, so
every card ends in a request for a quotation and the passport section points
people at the phone.

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:8080>. MongoDB is optional in development — see
*Where leads go* below.

Configuration lives in `.env`:

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 8080) |
| `NODE_ENV` | `production` enables the HTTPS redirect |
| `MONGODB_URI` | Optional. Secondary store for enquiries |
| `JWT_SECRET` | Signs admin tokens. Must be changed before deploying |
| `FRONTEND_URL` | Allowed CORS origin |

## Layout

```
public/          the entire web root - nothing outside it is ever served
  index.html
  css/styles.css
  js/main.js
  assets/video/  six destination clips for the hero backdrop
  assets/img/    poster frame for each clip
  assets/dest/   twelve destination photographs for the cards
data/            leads.ndjson - captured enquiries, gitignored, never served
scripts/         check-email.js, an SMTP smoke test
server.js        Express app, API, email notification and static serving
.env.example     copy to .env and fill in
```

`server.js` serves `public/` and nothing else. It previously served the whole
project directory, which meant `server.js`, `package.json`, `.bak` files and
the captured leads were all downloadable by anyone who guessed the filename.

## Email notifications

**This needs one credential before launch.** Everything else is wired.

Every enquiry is emailed to the address in `NOTIFY_EMAIL` (currently
`bluejetholidaypune@gmail.com`, the same address shown in the site footer),
with `Reply-To` set to the customer, so hitting Reply in the inbox writes
straight back to them.

Gmail will not accept a normal account password over SMTP. Create an App
Password:

1. Google Account > Security > turn on **2-Step Verification** if it is off
2. Security > **App passwords** > create one named "Blue Jet website"
3. Put the 16-character value into `SMTP_PASS` in `.env`, with no spaces

Then confirm it actually works:

```bash
npm run check:email
```

That sends one real test message and prints a specific reason on failure
(wrong password type, blocked port, unreachable host). The server also checks
SMTP at boot and prints either `SMTP ready` or a warning naming the problem.

**Leaving SMTP unset is safe.** Enquiries are still captured in
`data/leads.ndjson`, the visitor still gets a success message and the WhatsApp
handoff, and the server logs a warning. It only means nothing lands in the
inbox, so this is the one thing to check before going live.

## Where leads go

Every enquiry is appended to `data/leads.ndjson` **first**, one JSON object per
line, before anything else is attempted. MongoDB is written to only when the
connection is actually live (`readyState === 1`). A database that is down,
misconfigured or absent therefore costs nothing — the lead is already on disk.

Read the day's enquiries with:

```bash
cat data/leads.ndjson
```

That file holds customer names, phone numbers and email addresses. It is
gitignored and blocked from the web root. Keep it that way.

After a successful capture the visitor is offered WhatsApp and email handoff
links. They are rendered for the visitor to click, never opened automatically:
a `window.open` fired after an `await` is blocked as a popup, and launching a
message on someone's behalf the instant they submit a form is hostile.

## API

| Method | Route | Notes |
|---|---|---|
| `POST` | `/api/contact` | Public. Validated, rate limited to 20 per 15 min, honeypot-protected |
| `GET` | `/api/destinations` | Public |
| `GET` | `/api/destinations/:id` | Public |
| `GET` | `/api/health` | Public |
| `POST` | `/api/destinations` | Admin token |
| `GET` | `/api/inquiries` | Admin token |
| `PUT` | `/api/inquiries/:id` | Admin token |
| `POST` | `/api/auth/register`, `/api/auth/login` | Rate limited to 5 per 15 min |

## Front end

No framework and no build. GSAP with ScrollTrigger handles a single
rise-and-fade reveal; everything else is CSS.

The hero backdrop is real destination footage that changes when a tab is
clicked. Only the visible clip ever holds a `src`, so first load fetches one
video rather than six, and the others are fetched on demand and paused when
not on screen. `prefers-reduced-motion` holds the poster frame instead.

The CSP sets `script-src-attr 'none'`, so **inline `onclick` attributes will
not fire**. Bind events in `public/js/main.js` instead. This is the single
easiest way to break this site.

## Security

- CSP, HSTS, `nosniff`, `X-Frame-Options`, referrer policy via Helmet
- Subresource Integrity on every CDN script and stylesheet
- Static serving locked to `public/`, dotfiles denied
- HTTPS redirect when `NODE_ENV=production`, `trust proxy` set for real client IPs
- Rate limiting: 20/15min on the enquiry form, 5/15min on auth
- Honeypot field plus a three-second minimum submit time, both failing silently
- Input validation and escaping via express-validator; stored values are decoded
  again so a planner does not read `Dubai &amp; Abu Dhabi` off the lead sheet
- Privacy notice on the form and in the footer; no tracking or advertising cookies

## SEO and AI discovery

Lighthouse (mobile, navigation mode) scores 100 for SEO, Best Practices,
Accessibility and Agentic Browsing, with zero failed audits.

`public/llms.txt` gives assistants a plain-text summary of destinations,
services, seasons and the no-price-list policy. `robots.txt` explicitly allows
GPTBot, ClaudeBot, PerplexityBot, Google-Extended and the rest. JSON-LD in the
page head covers `TravelAgency`, `WebSite`, an `ItemList` of destinations and a
`FAQPage`.

## Media licensing

**See `MEDIA-LICENSES.md`** for the full record: every file, its Pexels or
Mixkit id, its source URL, and the list of images rejected during review with
the reason for each.

Short version. All media is self-hosted, never hotlinked, and licensed for
commercial use with no attribution required. The licences do not cover two
things that matter here: **identifiable people** (no model release, and a
recognisable face selling holidays can imply endorsement) and **trademarks**.
Every image was opened and checked for both; anything that failed was dropped
rather than cropped, which is why three destinations carry three photographs
instead of four.

Stock search relevance is poor and must not be trusted. Rejected during
review: a "Thailand" clip showing Javanese candi towers, a "Sentosa" search
returning the Palm Jumeirah in Dubai, a "Rajasthan" search returning the
Golden Temple in Punjab, and a "Golden Bridge" search returning a stock photo
of a couple's hands. Check what you are actually looking at before shipping it.

## Before going live

- [ ] Set `SMTP_PASS` in `.env` and confirm with `npm run check:email`
- [ ] Set `NODE_ENV=production` (enables the HTTPS redirect)
- [ ] Set `FRONTEND_URL` to the live origin, for CORS
- [ ] Generate a fresh `JWT_SECRET` on the server, not a copy of the local one
- [ ] Point the domain at the host and confirm HTTPS terminates in front of Node

## Known gaps

- Videos are unoptimised at 2.4–7.0 MB. Re-encoding to roughly 1 MB each needs
  ffmpeg, which is not installed on this machine.
- `npm audit` reports two moderate advisories in `qs`, reached through Express.
  Clearing them requires Express 5, a breaking major upgrade, so the project
  stays on 4.22.2 (the latest 4.x). The advisories are query-string DoS vectors,
  and this app takes almost no query strings, caps bodies at 10 kb and rate
  limits every route. Revisit when Express 5 is worth the migration.
- MongoDB is optional and currently unused in practice; `data/leads.ndjson` is
  the real store. Wire up a database only if you want the admin endpoints.
- The admin endpoints have no interface. They work only via an API client.

# Syncave

Arabic-first chatbots for business websites. Turn any site into a Q&A chatbot: add a site, write questions and answers, verify domain ownership, publish, and paste one `<script>` tag into the site.

## Run locally

Prerequisite: Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:3000
```

| URL | What |
|---|---|
| `/` | Public landing page (Arabic / English) |
| `/signup`, `/login` | Accounts |
| `/simulate?url=…` | Simulator: any website with a demo bot on top (public) |
| `/simulate?bot=…` | Simulator: the owner's *draft* bot on their own site (login required) |
| `/app` | Dashboard — login required |

**First run:** the first account you create takes ownership of any sites that existed before accounts were added. Create your own account first.

No API keys are needed — answers come from your own Q&A pairs via keyword matching that understands English, Arabic and Egyptian colloquial (normalized spelling, ال/و prefixes, common filler words).

Other scripts: `npm run lint` (type-check), `npm run build` (production bundle into `dist/`).

### Environment variables (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Where `bots.json`, `users.json`, `sessions.json` live — point at a persistent disk in production |
| `NODE_ENV` | — | `production` serves the built `dist/` and marks the session cookie `Secure` (HTTPS only) |
| `TRUST_PROXY` | — | Set to `1` behind a reverse proxy so rate limiting sees real visitor IPs |
| `DISABLE_HMR` | — | `true` turns off dev live-reload (needed when running two dev servers) |

## Database: local files or Supabase

All data goes through one interface (`server/db/`), with two backends:

| | Local JSON (default) | Supabase |
|---|---|---|
| When | No Supabase env vars set | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set |
| Users, sessions, bots (Q&A + published snapshot) | `DATA_DIR/users.json`, `sessions.json`, `bots.json` | tables `users`, `sessions`, `bots` |
| Orders, unanswered questions | `DATA_DIR/orders.json`, `unanswered.json` | tables `orders`, `unanswered` (+ counters on `bots`) |
| Conversations, messages | `DATA_DIR/conversations.json`, `messages.json` | tables `conversations`, `messages` (+ `unread_count` on `bots`) |
| Uploaded images | `DATA_DIR/uploads` served at `/uploads/…` | Storage bucket `uploads` (public URLs) |
| Anonymized unanswered log | `DATA_DIR/unanswered-global.jsonl` | table `unanswered_global` |

**Switching to Supabase**

1. Create a project at supabase.com. In **SQL → New query**, paste `supabase/schema.sql` and run it (tables, indexes, triggers, functions, RLS, grants, the `uploads` bucket). Upgrading a project that ran the first schema version (orders/unanswered as JSON on bots)? Run `supabase/migrate-002-orders-unanswered.sql` instead — it copies the data over. Then `supabase/migrate-003-inbox.sql` adds conversations.
2. **Project Settings → API**: copy the *Project URL* and the *service_role* key. Put them in `.env.local`:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
   The service-role key bypasses RLS and must stay on the server — never put it in client code or commit it (`.env*` is git-ignored).
3. Move existing data (optional): `npx tsx scripts/migrate-to-supabase.ts` shows what would move; add `--apply` to write. It upserts users, live sessions and bots, uploads referenced images to the bucket and rewrites their URLs, and imports the global log. Safe to re-run.
4. Start the server as usual. The boot log says `Database: Supabase (…)`.

**Built for many customers at once**
- Orders and unanswered questions are their own rows. A visitor's order is one `insert_order()` call (insert + per-plan cap in one transaction); a fallback hit is one `record_unanswered()` call (upsert + increment + cap). Nothing rewrites the bot row, so concurrent visitors — and several server instances — can't lose each other's writes.
- `bots.order_count` / `unanswered_count` are kept by triggers, so listing a dashboard is a single query with no per-site counting.
- The dashboard pages orders (`GET /api/bots/:id/orders?limit=50&offset=0` → `{ orders, total }`); CSV export streams in pages of 500.
- Cookie → user lookups are cached in memory for 30 s per server (cleared on logout), so a busy dashboard costs one database round-trip per half minute per user. A plan changed directly in the database shows up within that window.
- `GET /api/bot/:id/public` (what the widget loads) is sent with `Cache-Control: public, max-age=60`; the widget order endpoint is rate-limited to 30 per 10 minutes per IP. Set `TRUST_PROXY=1` behind a proxy so limits see real visitor IPs.

Notes: the server still uses its own email + password accounts and cookie sessions (not Supabase Auth), so nothing changes for users. Rate limiting is in memory per server instance.

## Accounts & security

- Email + password; passwords hashed with scrypt; sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie (stored server-side only as SHA-256 hashes), valid 30 days.
- Every `/api/bots` route requires login and only returns/changes the caller's own bots (others' bots answer 404).
- Login/sign-up are rate-limited (20 attempts / 15 min / IP, in memory).
- Public, no-login endpoints: `/widget.js`, `GET /api/bot/:id/public`, `POST /api/bots/:id/orders`.
- Paid plans aren't billed yet: everyone starts on Free, and a plan picked on the pricing page is saved as `requestedPlan` on the user in `users.json` — a sales lead to follow up. To activate a plan, set that user's `plan` field in `users.json` to `starter`, `business` or `agency` (takes effect on their next request).
- Not built yet: password reset, email verification.

### Hardening

- **CSRF:** besides the `SameSite=Lax` cookie, `/api/auth` and `/api/bots` reject state-changing requests whose `Origin`/`Referer` is another site. Set `APP_URL` if the dashboard is served from a different host than the API.
- **Headers on every response:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security` in production.
- **Uploads:** the type is detected from the file's bytes (PNG, JPG, GIF, WebP); SVG and anything else is refused. `/uploads` files are served with a sandboxing CSP so they can never run as a page.
- **Input limits:** bot text fields, Q&A size/count and image URLs are bounded and validated server-side; widget orders validate types and email; login rejects oversized passwords before hashing.
- **Rate limits:** dashboard API 300 req/min/IP; adding/verifying a site (which fetches the customer's website) 30 per 10 min.
- **Widget:** answer text is fully HTML-escaped (including quotes) before links/bold are applied.
- **IDs and tokens** use the platform's secure random generator.

## Running in production

```bash
npm run build
NODE_ENV=production npm start          # or: docker build -t syncave . && docker run -p 3000:3000 --env-file .env.local -v syncave-data:/data syncave
```

- `GET /api/health` → `200 {"ok":true,…}` when the server and database respond, `503` otherwise or while shutting down. The Dockerfile uses it as its `HEALTHCHECK`; point your host's health check at it too.
- **Graceful shutdown:** on `SIGTERM`/`SIGINT` the server stops accepting connections, lets in-flight requests finish (up to 10 s), then exits — safe for rolling deploys.
- **Timeouts:** slow clients are cut off (headers 20 s, request 60 s). Every Supabase call times out after `DB_TIMEOUT_MS` (default 10 s); read calls retry twice with exponential backoff on network errors or 502/503/504. Writes are never retried, so they can't run twice.
- **Logs:** one JSON object per line in production (`time`, `level`, `msg`, `requestId`, …). Every response carries an `X-Request-Id` to match a user's report to a log line. Failed (5xx) and slow (>2 s) API requests are always logged; `LOG_REQUESTS=1` logs every API request.
- **Backups (local-file mode):** `npm run backup` copies `DATA_DIR` to `./backups/<timestamp>/` (`-- --keep 14` keeps the newest 14; `BACKUP_DIR` changes the folder). `npm run backup -- --restore backups/<timestamp>` restores, after saving the current data. Run it daily from cron / Task Scheduler. With Supabase, use Supabase's backups (Project → Database → Backups).

| Variable | Purpose |
|---|---|
| `APP_URL` | Extra allowed origin for the CSRF check |
| `DB_TIMEOUT_MS` | Supabase request timeout (default 10000) |
| `LOG_REQUESTS` | `1` logs every API request |
| `LOG_DEBUG` | `1` enables debug logs |
| `BACKUP_DIR` | Where `npm run backup` writes (default `./backups`) |

## Unanswered questions

When a visitor on a live site types something that gets the fallback message, the widget reports the text to `POST /api/bots/:id/unanswered` (public, CORS, rate-limited: 60 / 10 min / IP, published bots only, 300 chars max). The server groups spelling variants with `questionKey()` from `shared/normalize.ts`, counts repeats, and keeps the 200 most-asked per site. The dashboard's **Unanswered** tab lists them by frequency with **Add as Q&A** (prefilled with the closest existing answer when there is one) and **Dismiss**. Nothing is logged from the dashboard preview or the simulator.

An anonymized copy is appended to `DATA_DIR/unanswered-global.jsonl` — one line per hit with the question text, script (`ar`/`en`), the site's template id as the industry, and the day. No site id, owner, IP or exact time. This is the raw material for improving the matcher's dialect coverage across all customers; mention it in your privacy policy.

## Inbox: visitor conversations and replies

Every chat on a published site is saved: the widget batches visitor and bot messages to `POST /api/bots/:id/conversations` (public, CORS, rate-limited, bounded to 10 messages / 2000 chars each). Conversations are keyed by a per-tab id and a per-browser visitor id (localStorage); a conversation can only be extended or read by the visitor id that created it. Owners read them in the site's **Inbox** tab (newest activity first, unread marked; opening a thread marks it read) and reply; the widget polls `GET /api/bots/:id/conversations/:cid/messages?visitor=…&after=…` for owner replies every 6 s while open (30 s closed, stops after 30 idle minutes) and shows them with a "Reply from the team" tag — so replies arrive while the visitor's tab is still open. `bots.unread_count` is trigger-maintained (Supabase) and drives the tab badge and the overview's "needs attention" list. Retention per plan: see the table below.

**Test chats.** Chatting in the dashboard's live preview, or in "Preview on my site" (the owner simulator), saves the conversation to the Inbox as a test chat, even for unpublished drafts. Owners can reply and watch the reply arrive in the preview, delete one test chat, or remove them all with "Delete test chats". They go through authenticated endpoints (`POST /api/bots/:id/test-messages`, `GET /api/bots/:id/test-messages/:cid`, `DELETE /api/bots/:id/test-conversations`) and are marked by a `test_` visitor id, which the public widget API refuses, so visitors can't create or delete test chats. Test chats count toward the plan's conversation retention. The public demo simulator (`/simulate?url=…`) records nothing.

## Plan limits

Defined once in `shared/plans.ts`, enforced by the server and shown as usage meters / locked features in the dashboard.

| | Free | Starter | Business | Agency |
|---|---|---|---|---|
| Websites | 1 | 1 | 5 | Unlimited |
| Questions per site | 20 | Unlimited | Unlimited | Unlimited |
| Order collection | — | ✓ | ✓ | ✓ |
| Orders stored per site | — | 500 | 5,000 | Unlimited |
| Conversations stored per site | 100 | 1,000 | 10,000 | Unlimited |
| Logo & background image | — | ✓ (5 MB) | ✓ (5 MB) | ✓ (5 MB) |

How it's enforced:
- `POST /api/bots` refuses a new site past the plan's count; a template's Q&A is trimmed to the plan's limit and orders are left off when the plan doesn't include them.
- `PATCH /api/bots/:id` and `/upload` refuse edits that would exceed the plan (too many questions, enabling orders, adding images).
- `POST /api/bots/:id/publish` refuses while a site is over its limits (e.g. after a downgrade) and says what to fix.
- `POST /api/bots/:id/orders` (widget) only accepts orders when the owner's plan includes them, and keeps the newest N per site — older ones are dropped. The Orders tab warns at 80 %.

## Simulator

`POST /api/simulate {url}` fetches the page server-side and keeps a snapshot for 15 minutes; `GET /api/simulate/:id` serves it to the simulator's iframe. The real widget runs in preview mode on top (`window.SyncavePreview = { bot, container }` → no fetch, no history, orders not submitted).

Safety:
- **No internal addresses.** All server-side fetches of user-typed URLs (simulator, site title, verification) go through `server/safeFetch.ts`, which refuses private/loopback/link-local/metadata IPs at DNS-lookup time (including after redirects).
- **Sandboxed snapshot.** Served with `Content-Security-Policy: sandbox allow-scripts allow-popups …` (no `allow-same-origin`), so the page can't read our cookies or call our API as the user even though it comes from our domain; forms are disabled; `noindex`; snapshots expire. For production, serving snapshots from a separate domain would be stronger still.
- Rate-limited: 30 previews / 10 min / IP.

Limits: sites built entirely with JavaScript may render blank in the snapshot (shown with a hint); the bot still works when installed. The snapshot gets an in-memory storage stand-in and forces animation-hidden content (Elementor, AOS, WOW.js) visible.

## Mobile app (Android, via Capacitor)

The app is a native shell that loads the Syncave server's dashboard (`/app`) — same login, same features, plus Android back-button handling, an app icon/splash, safe-area padding and an offline screen (`public/offline.html`). Config: `capacitor.config.ts`.

```powershell
.scriptsandroid.ps1 -ServerUrl http://<this-PC-IP>:3000   # test on a phone on the same Wi-Fi
.scriptsandroid.ps1                                       # Android emulator (uses http://10.0.2.2:3000)
.scriptsandroid.ps1 -ServerUrl https://app.your-domain.com # production
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Add `-Open` to open the project in Android Studio.

- Capacitor 8 needs **Node 22+ and Java 21+**. The script uses portable copies from `%USERPROFILE%.syncave-tools` (`node22`, `jdk21`) when the installed ones are older — or install Node 22 / update Android Studio and they'll be used instead.
- Testing on a phone: the dev server must be reachable — allow Node through Windows Firewall on port 3000, and keep the phone on the same network.
- App icon / splash sources are in `assets/` (regenerated into the Android project on every build).
- For Google Play: deploy the server on HTTPS, build with that URL, and produce a signed release bundle in Android Studio (Build → Generate Signed Bundle).
- In the app, orders CSV export is hidden (Android's WebView can't save downloads) — export from the website.
- iOS needs a Mac with Xcode (`npx cap add ios`).

## Project structure

```
server/                 Express API + Vite dev middleware
  index.ts              entry point (npm run dev)
  jsonStore.ts          JSON-file "tables" with atomic writes + a write queue (swap for a DB later)
  store.ts              bots: owner-scoped access helpers
  auth/                 passwords (scrypt), accounts + sessions, login middleware
  rateLimit.ts          simple per-IP limiter
  safeFetch.ts          fetch user-typed URLs without reaching internal addresses
  site.ts               fetching the customer's site: title, verification tag
  http.ts               error handling + CORS helpers
  routes/auth.ts        sign up, log in, log out, me
  routes/public.ts      endpoints the embedded widget calls (CORS-enabled, no login)
  routes/bots.ts        dashboard CRUD, upload, verify, publish, discard, orders (login required)
  routes/simulate.ts    website snapshots for the simulator
shared/                 code used by both server and client
  types.ts              Bot / User / QA / Order types, draft-vs-published helpers
  templates.ts          industry starter templates
src/                    React client
  Root.tsx              top-level pages: landing, login, sign-up, /app
  auth.tsx, i18n.tsx    signed-in user; Arabic/English for public pages
  landing/              landing page, login/sign-up page, all copy + prices (content.ts)
  simulator/            /simulate page
  App.tsx               dashboard shell + #/ routing
  hooks/                useBots (state + autosave), useRoute (#/ URLs), usePath, useClipboard
  lib/                  API client, matcher (mirrors widget.js — change both together), formatting
  components/ui/        Button, Card, Alert, Badge, CodeBlock, Toast, …
  components/Logo.tsx   Syncave logo mark (brand colors live in src/index.css → --color-brand-*)
  components/layout/    Sidebar, MobileNav, AccountMenu
  features/site/        a site's workspace: header + Q&A / Appearance / Embed / Orders / Verify tabs
  features/preview/     draft chat preview
  pages/                Overview, Docs, Help
public/widget.js        the embeddable chat widget (plain JS, no build step)
data/                   runtime storage (git-ignored)
```

Dashboard URLs are shareable: `/app#/overview`, `/app#/sites/<id>/<tab>`. Old `/#/…` links redirect.

**Editing the landing page:** all text (both languages) and prices are in `src/landing/content.ts`.

## How publishing works

Edits autosave as a **draft**. The widget only serves the **published** snapshot, which is created when you click Publish (or press Ctrl/Cmd+S) on a verified site. Discard reverts the draft to the published snapshot.

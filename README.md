# Syncave

Arabic-first chatbots for business websites. Turn any site into a Q&A chatbot: add a site, write questions and answers, verify domain ownership, publish, and paste one `<script>` tag into the site.

## How it runs

Two free services, nothing else:

| Part | Where |
|---|---|
| Website, dashboard, `widget.js` | **Firebase Hosting** (static files from `dist/`) |
| Sign-in | **Supabase Auth** (email + password) |
| API: dashboard + widget endpoints, site fetching, simulator | **Supabase Edge Function `api`** (`server/` → bundled to `supabase/functions/api/index.js`) |
| Data and uploaded images | **Supabase** Postgres + Storage bucket `uploads` |

The browser signs in with Supabase Auth and sends its access token to the API (`Authorization: Bearer …`). The API uses the service-role key (provided to Edge Functions automatically) and checks ownership on every call; Row Level Security is on with no policies, so the public key can't read tables directly.

Answers come from your own Q&A pairs via keyword matching that understands English, Arabic and Egyptian colloquial. No AI keys needed.

## Setup (once)

1. **Supabase SQL.** In the SQL editor run, in order, whichever you haven't yet: `supabase/schema.sql` (fresh project) or the `migrate-00X-*.sql` files (existing project) through `migrate-005-supabase-auth.sql`.
2. **Supabase Auth.** Authentication → Sign In / Providers → Email: enabled. Keep **Confirm email** on (existing accounts are only linked to a login after the email is confirmed). Authentication → URL Configuration: set **Site URL** to your Firebase address (e.g. `https://<project>.web.app`) and add `http://localhost:3000` to Redirect URLs.
3. **`.env.local`** (git-ignored):
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=...        # Project Settings → API Keys → anon / publishable (public)
   ```
4. **Firebase.** `firebase login` with the account that owns the Firebase project, then `firebase use --add` to pick it.

## Commands

| | |
|---|---|
| `npm run dev` | Website + dashboard on http://localhost:3000 (talks to the deployed `api` function) |
| `npm run test:api` | API tests in Node against throwaway local data (never touches Supabase) |
| `npm run deploy:api` | Bundle `server/` and deploy the `api` Edge Function (first time: `npx supabase login`) |
| `npm run deploy:web` | Build and deploy the website to Firebase Hosting |
| `npm run deploy` | Both |
| `npm run lint` | Type-check |

## Accounts & security

- Sign-up/log-in/log-out are Supabase Auth. Each login is linked to a Syncave account (`public.users`: name, plan, owned bots) through `auth_id`. On first sign-in the API creates the account, or links an account from before Supabase Auth that has the same email, **only once the email is confirmed**.
- Accounts from before the move keep their sites and plan, but sign up once more with the same email (old passwords can't be carried over).
- Every dashboard route checks the token and only returns or changes the caller's own bots (others' bots answer 404).
- Public, no-login endpoints (what `widget.js` calls): `GET /api/bot/:id/public`, `POST /api/bots/:id/{orders,unanswered,conversations}`, `GET /api/bots/:id/conversations/:cid/messages`, `POST /api/simulate`. All rate-limited per IP and size-bounded.
- Uploads: type detected from the file's bytes (PNG, JPG, GIF, WebP; no SVG); stored in Supabase Storage.
- Server-side fetches of user-typed URLs refuse private, loopback and metadata addresses (`server/safeFetch.ts`), including after redirects.
- Firebase Hosting adds security headers (`firebase.json`); the widget answer text is HTML-escaped before formatting.
- Paid plans aren't billed yet: a plan picked on the pricing page is stored as `requested_plan` (a sales lead). Activate by setting `plan` on the user's row in `public.users`.
- Not built yet: password reset screen (Supabase can send reset emails; add a page for it).

## Logs and health

- `GET /api/health` → `{"ok":true}` when the function and database respond.
- Logs: Supabase → Edge Functions → `api` → Logs. One JSON object per line; every response carries `X-Request-Id`.
- Database calls time out after 10 s (`DB_TIMEOUT_MS`); reads retry twice with backoff, writes never retry.

## Unanswered questions

When a visitor on a live site types something that gets the fallback message, the widget reports the text to `POST /api/bots/:id/unanswered` (public, CORS, rate-limited: 60 / 10 min / IP, published bots only, 300 chars max). The server groups spelling variants with `questionKey()` from `shared/normalize.ts`, counts repeats, and keeps the 200 most-asked per site. The dashboard's **Unanswered** tab lists them by frequency with **Add as Q&A** (prefilled with the closest existing answer when there is one) and **Dismiss**. Nothing is logged from the dashboard preview or the simulator.

An anonymized copy is added to the `unanswered_global` table — one line per hit with the question text, script (`ar`/`en`), the site's template id as the industry, and the day. No site id, owner, IP or exact time. This is the raw material for improving the matcher's dialect coverage across all customers; mention it in your privacy policy.

## Inbox: visitor conversations and replies

Every chat on a published site is saved: the widget batches visitor and bot messages to `POST /api/bots/:id/conversations` (public, CORS, rate-limited, bounded to 10 messages / 2000 chars each). Conversations are keyed by a per-tab id and a per-browser visitor id (localStorage); a conversation can only be extended or read by the visitor id that created it. Owners read them in the site's **Inbox** tab (newest activity first, unread marked; opening a thread marks it read) and reply; the widget polls `GET /api/bots/:id/conversations/:cid/messages?visitor=…&after=…` for owner replies every 6 s while open (30 s closed, stops after 30 idle minutes) and shows them with a "Reply from the team" tag — so replies arrive while the visitor's tab is still open. `bots.unread_count` is trigger-maintained (Supabase) and drives the tab badge and the overview's "needs attention" list. Retention per plan: see the table below.

**Test chats.** Chatting in the dashboard's live preview, or in "Preview on my site" (the owner simulator), saves the conversation to the Inbox as a test chat, even for unpublished drafts. Owners can reply and watch the reply arrive in the preview, delete one test chat, or remove them all with "Delete test chats". They go through authenticated endpoints (`POST /api/bots/:id/test-messages`, `GET /api/bots/:id/test-messages/:cid`, `DELETE /api/bots/:id/test-conversations`) and are marked by a `test_` visitor id, which the public widget API refuses, so visitors can't create or delete test chats. Test chats count toward the plan's conversation retention. The public demo simulator (`/simulate?url=…`) records nothing.

## Plan limits

Defined once in `shared/plans.ts`, enforced by the API and shown as usage meters / locked features in the dashboard.

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

`POST /api/simulate {url}` fetches the page in the Edge Function, rewrites it to load its assets from the real site, and returns the HTML. The simulator shows it in an iframe via `srcdoc` with `sandbox="allow-scripts allow-popups …"` and no `allow-same-origin`, so the page runs in an opaque origin and can't read Syncave's storage or call the API as the owner. The real widget runs on top in preview mode (`window.SyncavePreview = { bot, container, api }`). Rate-limited: 30 previews / 10 min / IP.

Sites built entirely with JavaScript may render blank in the preview (shown with a hint); the bot still works when installed.

## Mobile app (Android, via Capacitor)

The app is a native shell that loads the hosted dashboard (`/app`). Build it against the Firebase address:

```powershell
.\scripts\android.ps1 -ServerUrl https://<project>.web.app
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Add `-Open` to open the project in Android Studio. Capacitor 8 needs Node 22+ and Java 21+. Orders CSV export is hidden in the app (Android's WebView can't save downloads).

## Project structure

```
server/                 The API (Hono), runs as the Supabase Edge Function "api"
  app.ts                every route: dashboard (signed in) + widget (public) + simulator
  auth.ts               Supabase token → Syncave account (create / link by confirmed email)
  edge.ts               Edge Function entry (bundled by scripts/build-api.mjs)
  store.ts              owner-scoped bot access helpers
  site.ts, safeFetch.ts fetching customers' sites safely (title, verification tag, simulator)
  db/                   Database interface; supabase.ts (production), json.ts (tests only)
supabase/
  schema.sql            fresh-project schema;  migrate-00X-*.sql  upgrades
  config.toml           function settings;  functions/api/index.js  generated bundle
shared/                 code used by the API and the website (types, plans, templates, matching)
src/                    React website + dashboard (Vite)
  auth.tsx              Supabase Auth sign-in state;  lib/supabase.ts  client + API address
  lib/api.ts            typed API client (adds the access token)
  landing/              landing page, login/sign-up, all copy + prices (content.ts)
  simulator/            /simulate page
public/widget.js        the embeddable chat widget (plain JS; API address baked in by scripts/postbuild.mjs)
firebase.json           Firebase Hosting: SPA rewrites, caching, security headers
```

Dashboard URLs: `/app#/overview`, `/app#/sites/<id>/<tab>`.

**Editing the landing page:** all text (both languages) and prices are in `src/landing/content.ts`.

## How publishing works

Edits autosave as a **draft**. The widget only serves the **published** snapshot, which is created when you click Publish (or press Ctrl/Cmd+S) on a verified site. Discard reverts the draft to the published snapshot.

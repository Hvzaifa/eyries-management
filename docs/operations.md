# Operations

How to run, change and recover this system. Everything here writes to a real
database holding real bookings — read the warning on a command before running it.

---

## Commands

| Command | Writes? | Purpose |
|---|---|---|
| `npm run dev` | no | Dev server on :3000 |
| `npm run build` | no | Production build. **Run before calling any change done** |
| `npm test` | no | Unit tests (vitest) |
| `npm run lint` / `npm run typecheck` | no | ESLint / TypeScript |
| `npm run db:apply` | **yes** | Applies `db/schema.sql`, row level security included. Idempotent |
| `npm run db:seed` | **yes** with `-- --commit` | Lookup tables only (licenses, branches, airlines). Dry-runs by default; `--commit` backs up branches and airlines to `backups/` first. Never deletes a row |
| `npm run job:deadline-check` | **yes** (backfill) | Dry-runs the daily alert; `-- --send` delivers it |
| `npm run ai:check` | no | Probes each configured AI provider once (no booking data sent) |

### Retired one-off scripts (removed 2026-09-25)

These did their job and were taken out of the working tree. None is needed to
build or run the system. Each is recoverable from git:

| Files | What they were | Restore with |
|---|---|---|
| `db/apply-agents.ts`, `apply-agent-assignments.ts`, `apply-agent-recoveries.ts`, `apply-emd-statuses.ts`, `apply-iata-payments.ts`, `apply-drop-dashboard-view.ts` | One-off migrations, all applied to production (2026-09-19 → 2026-09-24). Every change is also in `db/schema.sql`, so `npm run db:apply` still builds or heals a database without them | `git checkout archive/one-off-scripts -- <path>` |
| `scripts/map-legacy-agents.ts`, `src/lib/legacy-agents.ts` (+ test) | Proposed agents and seat hand-overs from the legacy sheet's free-text `investor_company` | `git checkout archive/one-off-scripts -- <path>` |
| `scripts/emd-deadline-review.ts` | Report on the 8 rounds that existed before the 2026-09-20 reset | `git checkout archive/one-off-scripts -- <path>` |
| `scripts/import-legacy.ts`, `src/lib/legacy-import.ts` (+ test), `scripts/apply-completion-rule.ts`, `scripts/merge-duplicate-branches.ts`, `scripts/make-sample-sheet.ts` | The master-sheet importer and its helpers | `git checkout 9a6c1e0 -- <path>` |

`archive/one-off-scripts` is a branch holding exactly those files on top of
`main` as it stood on 2026-09-25. It is not meant to be merged — only read from.

### Retired in the 2026-10-16 cleanup

Each was checked for remaining users first (`decisions.md`, 2026-10-16). None is
needed to build, run or rebuild the system:

| Files | Why they went | Restore with |
|---|---|---|
| `scripts/import-master-sheet.ts`, `src/lib/master-sheet-import.ts` (+ test) | The spreadsheet importer. The owner ruled the database will not be reloaded from the sheet again; it is now the record. Its one helper the app still uses, the Excel date reader, moved into `src/lib/ai/excel-mapping.ts` | The committed version: `git checkout 957c2ca -- <path>`. Its last version, with the uncommitted changes from the 2026-10-05 run, was copied to `backups/retired-2026-10-16/` on the owner's machine as `*.ts.bak` |
| `scripts/reset-bookings.ts`, `scripts/reset-transactional-data.ts` | Emptied the database for a reload. With no reload planned they could only destroy live data | `git checkout 957c2ca -- <path>` |
| `scripts/seed-users.ts` | Created the five `@eyries.local` logins, which the owner deleted on 2026-10-16. Logins are now made in the Supabase dashboard (below). It was the only user of the service-role key, so `SUPABASE_SERVICE_ROLE_KEY` and `SEED_*_PASSWORD` left `.env.example` too | `git checkout 957c2ca -- <path>` |
| `db/apply-security.sql`, `db/apply-security.ts` | One-off fix, applied to the live database on 2026-09-07. `db/schema.sql` carries every statement, for all twelve tables (these covered eight and nine), and `npm run db:apply` re-applies it | `git checkout 957c2ca -- <path>` |
| `docs/sessions/` | One 2026-09-01 note whose every point is in `PROGRESS.md` and `data-model.md`, and whose file paths no longer existed | `git checkout 957c2ca -- docs/sessions` |

**Owner action:** `SUPABASE_SERVICE_ROLE_KEY` bypasses row level security and
nothing uses it any more. Delete it from the local `.env`, and make sure it is
not set on Vercel.

> `npm run typecheck` can report success while `npm run build` fails: TypeScript
> uses an incremental cache (`tsconfig.tsbuildinfo`) that can go stale. If the
> two ever disagree, delete that file. **Trust the build.**

## Environment

All secrets come from `.env` (gitignored); `.env.example` lists every key. There
are deliberately **no fallback values in code** — a default password written into
a script is a published credential.

Required to run: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`DATABASE_URL`, `DIRECT_URL`.
Required for specific features: `RESEND_API_KEY` + `ALERT_FROM_EMAIL` +
`STAFF_ALERT_EMAILS` (email), `CRON_SECRET` (daily job), `GEMINI_API_KEY` and
`GROQ_API_KEY` (AI intake).

## Login accounts

Logins are created in the Supabase dashboard (**Authentication → Users → Add
user**). What a login may do comes from its **app metadata**, which the app reads
in `src/lib/auth.ts`:

- `{"account_type": "headoffice"}` — Head Office.
- `{"account_type": "branch", "branch_name": "<name>"}` — that branch only. The
  name must match a row in `branches` (case does not matter).

A login with neither, or with a branch name that matches no row, signs in and
sees nothing. App metadata can only be set with admin access, which is what makes
it safe; never use **user** metadata, which a user can change themselves. Set it
in the SQL Editor, one login at a time, checking the `where` clause matches
exactly one row first — an update without it would change every login:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"account_type": "branch", "branch_name": "Rawalpindi"}'::jsonb
where email = 'branch-login@example.com';
```

The setting reaches a session at its next sign-in. Writes check it with the Auth
server at once; pages read the session token, so a downgraded login keeps its old
view for up to the token's lifetime (one hour by default). To cut someone off
immediately, delete or ban the user.

## Changing the database

`db/schema.sql` is the single source of truth for types and is applied with
`npm run db:apply`. **Every post-launch change must appear twice in it:** once in
the `create table` block (for a fresh database) and once in the healing section
as an `alter table ... if not exists` (for an existing one). `create table if not
exists` never alters a live table, so a change written only in the create block
silently does nothing where it matters.

Changes applied straight to the live database or via Prisma must be mirrored back
into `schema.sql`, or a fresh deployment will not match production. This has gone
wrong before — see `decisions.md`, 2026-09-07 "db/schema.sql had drifted".

## Security posture

- **RLS is enabled on all twelve tables with no policies**, which denies the
  public `anon` role entirely. Authorisation lives in the app layer
  (`src/lib/auth.ts`); RLS is a deny-by-default backstop, not a second
  authorisation model.
- **The one SQL view, `refunded_emd_rounds`, declares `security_invoker = on`.**
  Without it a view runs with its owner's privileges and bypasses the RLS
  beneath it — which is exactly how the refund ledger was once publicly
  readable. (`dashboard_totals`, the other, was dropped on 2026-09-24.)
- **Response headers** (`next.config.ts`): frame, content-type, referrer and HSTS
  headers; a `Permissions-Policy` switching off camera, microphone, location,
  payment and USB; `X-Powered-By` removed; and a **Content-Security-Policy,
  enforced since 2026-09-25** after a Report-Only deploy showed no violations.
  If adding an external service ever breaks a page, the browser console names
  the blocked source; add it to the matching directive in `next.config.ts`.
- **Reads verify the session locally, writes ask the Auth server.** Pages and
  the middleware use `auth.getClaims()` (`src/lib/server/session.ts`); every
  server action that writes goes through `requireUser()`, which uses
  `auth.getUser()` so a disabled account is refused immediately rather than
  when its token expires.
- `/api/ai/parse-pnr`, the one route that spends money per call, is limited to
  20 requests per user per minute (`src/lib/rate-limit.ts`). Per instance, not
  global — it stops a runaway loop, the login requirement is the real gate.
- `npm audit --omit=dev` was at **0 vulnerabilities** on 2026-09-24. Two
  transitive packages are pinned through `overrides` in `package.json` —
  `postcss` inside Next and `deepmerge-ts` inside the Prisma CLI — because the
  patched versions are outside the ranges those packages declare. Remove the
  overrides when a Next or Prisma upgrade brings them in natively.
- The app is unaffected by either: Prisma connects as `postgres`, which owns the
  tables and holds `BYPASSRLS`.
- `npm run db:apply` applies all of this; `db/schema.sql` states it explicitly
  for every table and is safe to re-run.

Verify from outside with the public key — both must return `401`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/refunded_emd_rounds?select=*&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

### Owner action: switch Supabase to asymmetric JWT signing keys

Until the project signs sessions with an asymmetric key, `getClaims()` still asks
the Auth server on every request, so the ~300 ms per navigation it is meant to
save is not saved. The code is correct either way.

**State found on 2026-09-25:** the project already publishes an **ES256
(asymmetric) key** at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, so it may
already be the active key. The app's `NEXT_PUBLIC_SUPABASE_ANON_KEY` is a **new
publishable key** (`sb_publishable_…`), not a legacy JWT, so it does not depend
on the legacy secret. (An earlier version of this section said it did; that was
not checked at the time and was wrong.)

1. Supabase Dashboard → **Project Settings → JWT Keys**.
2. Look at **Current key**:
   - **ECC (P-256)** → nothing to do; local verification is already on.
   - **Legacy HS256 (shared secret)** → continue.
3. If you see **Migrate JWT secret**, click it. It imports the current secret and
   puts a new asymmetric key on standby. Nothing changes for users yet.
4. Click **Rotate keys** so the ECC key becomes current. Supabase: *"Non-expired
   access tokens will remain to be accepted, so no users will be forcefully
   signed out"*, with no downtime.
5. **No need to revoke the legacy secret.** Nothing is gained, and anything still
   holding a legacy key would stop working. Leave it as "previously used".

Checked before recommending this: nothing in this repository verifies JWTs
with the legacy secret itself (no `jose`/`jsonwebtoken`), and there are no Edge
Functions — the two things Supabase warns rotation can break. It can be undone:
a previously used key can be moved back to standby and rotated to.

## The AI intake: models, retries, and when it fails

`src/lib/ai/providers.ts` lists the attempts, tried in order for pasted text,
screenshots and spreadsheet column mapping (2026-10-05):

| # | Provider / model | Notes |
|---|---|---|
| 1 | Gemini `gemini-3.5-flash-lite` | Fastest: about 2–3 s for one booking, 8–12 s for a screenshot of 14 |
| 2 | Gemini `gemini-3.5-flash` | Same answers, slower (`reasoning_effort: low`). Sometimes answers 503 "UNAVAILABLE" |
| 3 | Groq `qwen/qwen3.8-27b` | Only when `GROQ_API_KEY` is set. Its free plan caps output at 1,000 tokens/minute (thinking off, `max_completion_tokens` 900), which covers one or a few bookings. A screenshot of a dozen bookings is beyond it. JSON mode needs the word "json" in the prompt |

**The reply is a table**: field names once, then one row of values per booking, plus a list of the values the model is unsure of, which are marked low confidence. Reply size decides the time taken. On a 14-booking screenshot, the earlier per-field format ran past the time limit; the table takes 8–12 s.

**Retry rules:**
- **busy** (5xx): one retry after 1.5 s.
- **timeout**: move on. A request that slow would be slow again.
- **quota** (429): move on at once.
- **key** (401/403): skip that provider.
- Each request is capped at 35 s, and everything at 55 s (the route sets `maxDuration = 60`).
- Vercel Hobby with Fluid compute (the default) allows up to 300 s, so this limit can be raised in the route if larger screenshots ever need it. Check Settings → Functions first.

**Every failure logs one line** in Vercel → Logs, without any booking data:

```
[AI] gemini/gemini-3.5-flash-lite try 1 failed: reason=quota http=429 code=RESOURCE_EXHAUSTED 412ms
```

A success logs `[AI] <provider>/<model> ok <ms>`.

**Health check:** `npm run ai:check` probes every configured attempt once with a tiny request (no booking data) and prints `ok`, `quota`, `busy`, `timeout`, `key` or `invalid` for each. Run it with the production keys in `.env` whenever staff report problems.

What staff see, and what it means:

| Message | Cause | Fix |
|---|---|---|
| "The AI service is not set up correctly…" (503) | No key is set, or every provider rejected its key (401/403) | Update `GEMINI_API_KEY` / `GROQ_API_KEY` **in Vercel → Settings → Environment Variables**, then redeploy. A key changed only in the local `.env` does not reach production |
| "The AI service is busy right now…" (503) | Every attempt was busy, out of quota or timed out | Read the `[AI] … reason=` lines. If the reason is `quota`, the free daily limit is used up (Google AI Studio → rate limits); otherwise retry in a minute |
| "Could not parse this input…" (500) | A model answered but the reply was unusable | Try again, or enter manually |
| "No PNR column could be found…" (422) | A spreadsheet with no recognisable PNR column, to the AI or the dictionary | Check that the sheet has a header row with a PNR column |

**Spreadsheets** (`parse-excel.ts`, `excel-mapping.ts`):
- One AI request maps the columns, whatever the layout. It is shown each column's header, how often it is filled and three example values; what every field means; and the licenses, branches, airlines and segments the system knows. Code then copies every value; the AI never types one.
- Flights written sector by sector (`flight_code_sector_1` … `_4`) are mapped as sectors and assembled by code: the return starts at the first sector departing two or more days after the one before; a same-day or next-day sector is a connection (a stop).
- The map is checked against the values: a "flight number" column that holds only airline codes is dropped.
- With no AI available, a fixed dictionary maps the columns instead, including numbered sector columns.
- Checked on the owner's two exports (2026-10-20): every field filled on both.
- The form loads at most **100** rows per upload; staff are told to upload the rest as a separate sheet.

**When Google retires a model** (404 "no longer available"), list what the key can use:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200" \
  -H "x-goog-api-key: $GEMINI_API_KEY" | grep '"name"'
```

Set `GEMINI_MODEL` in Vercel to pin a working model at once (`GROQ_MODEL` does the same for Groq), then update `GEMINI_MODELS` in `providers.ts`.

## Where page time goes, and how to check it

Measured on 2026-09-24 with 4 bookings in the database, from Pakistan to the
Singapore database (network round trip ~100 ms):

| | Before | After |
|---|---|---|
| One trivial query | 504 ms (≈5 round trips) | 101 ms (1) |
| Dashboard data (`listPnrs`) | 13 queries, 2,067 ms | 2 queries, 117 ms |
| Booking page data (`getPnrDetail`) | 23 queries, 3,740 ms | 3 queries, 212 ms |
| Form options | 20 queries, 1,244 ms | 5 queries, 111 ms |

Those are from a laptop. In production the functions now run in the same region
as the database, so each round trip is a few milliseconds rather than ~100.

The costs multiply: **round-trip time × round trips per query × queries in
series.** When something feels slow again, measure those three before reaching
for a cache. Count queries with Prisma's query log (`NODE_ENV=development`
prints each one) and look for `await`s that could run together.

## Backups

There is no automated backup beyond Supabase's own. **Before any destructive
operation, dump the data first** — every table to timestamped JSON under
`backups/` (gitignored; it holds live business data). The full re-import on
2026-09-07 did this and the procedure is recorded in `decisions.md`.

**Every local backup up to 2026-10-29 was deleted at the owner's request**
(folder cleanup, 2026-10-29). The backup paths named in `decisions.md` no
longer exist; Supabase's own backups are the only copy of that state. The rule
above still applies to every write from here on.

Restoring means re-inserting from those JSON files in FK-safe order:
`pnrs` → `emd_rounds` / `ticketing` / `allocations` → `activity_log`.

## Deploying to Vercel

The app is a standard Next.js App Router project; nothing about the deployment is
unusual except the two items called out below, both of which have bitten before.

### One-time setup

1. Push `main` to GitHub (`origin` is already configured).
2. In the Vercel dashboard, **Add New → Project**, import the repository, and
   accept the detected Next.js settings. Do not override the build command —
   `postinstall` handles Prisma (see below).

   `vercel.json` declares `"framework": "nextjs"` so this is not left to the
   project's dashboard preset. If a build ever fails before it starts with
   *"Project framework is set to X, but no services are declared"*, the preset
   in **Settings → General → Framework Preset** is wrong; set it to **Next.js**.
   The first deploy of this project failed exactly that way, with the preset on
   "services".
3. Add the environment variables from the table below, for **Production**,
   **Preview** and **Development**.
4. Deploy. The site runs at this point.
5. *If you want the daily alert email's link to work*, set `NEXT_PUBLIC_APP_URL`
   to the URL Vercel assigned and **redeploy** — `NEXT_PUBLIC_*` values are
   inlined at build time, so setting it alone does nothing until a rebuild.
   Nothing else depends on it.

### Environment variables

| Variable | Needed on Vercel | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | Public by design; RLS is what protects the data |
| `DATABASE_URL` | **yes** | Pooled connection, port **6543**, `?pgbouncer=true` — serverless opens many short-lived connections and the direct port will exhaust them |
| `DIRECT_URL` | **yes** | Port 5432, used for schema work |
| `CRON_SECRET` | **yes** | Vercel sends it to the cron route automatically |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `STAFF_ALERT_EMAILS` | for email | Deadline alerts and airline emails |
| `NEXT_PUBLIC_APP_URL` | for email | **Not needed for the site to run** — it appears in exactly one place, the "Open the dashboard" link inside the daily alert email (`src/lib/deadlines.ts`). Without it that link falls back to `http://localhost:3000` and points at the recipient's own machine |
| `GEMINI_API_KEY` | for AI intake | Google AI Studio key. Paste-and-parse and screenshot upload both fail without it. It must be a **Gemini** key — the code posts to Gemini's OpenAI-compatible endpoint, so a key from any other provider returns 401 no matter what the variable is named |
| `GEMINI_MODEL` | optional | Pins one Gemini model instead of `gemini-3.5-flash-lite` → `gemini-3.5-flash`. Lets a misbehaving model be routed around from the dashboard without a redeploy |
| `GROQ_API_KEY` | recommended | Free key from console.groq.com. Adds Groq as the backup provider when Gemini is busy or out of quota. Without it the intake is Gemini-only |
| `GROQ_MODEL` | optional | Pins the Groq model (default `qwen/qwen3.8-27b`) |

### The two things that catch people

**Prisma and Vercel's build cache.** Vercel restores a cached `node_modules`
between builds, which skips `prisma generate`, and the deployed app then runs
against a stale or missing client. `package.json` carries
`"postinstall": "prisma generate"` — Prisma's documented fix. If a deploy starts
failing with "Prisma has detected that this project was built on Vercel", that
hook has gone missing.

**`api/cron` must stay out of the middleware matcher.** Vercel Cron calls the
route with no session; if middleware sees it, the request is redirected to
`/login` and the job silently never runs. It did exactly that until 2026-09-07.

### After the first deploy — verify, do not assume

```bash
# 1. The public views must stay closed (this is the important one)
curl -s -o /dev/null -w '%{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/refunded_emd_rounds?select=*&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"          # expect 401

# 2. The cron route rejects an unauthenticated caller...
curl -s -o /dev/null -w '%{http_code}\n' https://<app>/api/cron/deadline-check   # expect 401

# 3. ...and accepts the real secret, rather than redirecting to /login
curl -s -o /dev/null -w '%{http_code}\n' https://<app>/api/cron/deadline-check \
  -H "Authorization: Bearer $CRON_SECRET"              # expect 200, NOT 307
```

A **307** on the third check means middleware is intercepting the cron again.

Then in the app: log in, confirm the dashboard loads, open a booking, and confirm
a branch account sees only its own branch.

### Supabase settings

Login is email/password (`signInWithPassword`), which needs no redirect
allowlisting — so basic login works on a fresh domain with no Supabase change.
Still set **Authentication → URL Configuration → Site URL** to the deployed URL,
or password-reset emails will link to the wrong host.

## Loading a new IATA calendar

The IATA remittance calendar lives in code, at `src/lib/iata-calendar.ts`. It is
**transcribed from IATA's published PDF, never computed** — the gap between a
billing period closing and its remittance day varies with weekends and holidays,
so there is no formula. The loaded calendar currently covers **1 Jan – 31 Dec
2026**.

An EMD issued past the end of the calendar gets no payment date. It is not
treated as settled: the booking shows "Not in calendar" on the dashboard and the
EMD appears under "Outside the loaded calendar" on `/iata`. So the symptom of a
stale calendar is visible, not silent.

To load the next year:

1. Get the calendar PDF for the country and currency the company settles in
   (Pakistan, PKR).
2. Take **only** rows whose `Remittance Frequency` is **"4 times per month"**.
   The PDF also carries a daily row per date with a frequency of `EasyPay` —
   a different settlement product, and not ours. `Billing Availability` is
   unused.
3. Append one `{ code, billingFrom, billingTo, remittanceDay }` entry per row to
   `IATA_PERIODS`, in date order, ISO dates.
4. Run `npx vitest run src/lib/iata-calendar.test.ts`. The tests check the
   transcription itself, not just the lookup: periods must be contiguous with no
   gaps or overlaps, every day of the year must fall in exactly one period, each
   month must have four, remittance must follow its billing window by 7–10 days,
   and each period code must agree with its own dates. A mistyped date fails
   there rather than surfacing as a wrong settlement figure.
5. Update the year in the first test (`holds the 48 ... periods`) and the
   coverage sentence above.

Nothing needs to be migrated or re-derived afterwards: payment deadlines are
read from the calendar on every request, never stored, so the new dates apply to
existing rounds immediately.

## The daily job

Vercel Cron calls `/api/cron/deadline-check` at 03:00 daily, authenticating with
`CRON_SECRET`. `api/cron` **must stay excluded from the middleware matcher** in
`src/middleware.ts`: cron arrives with no session, so middleware would redirect it
to `/login` and the job would never run. It did exactly that, silently, until
2026-09-07.

One run produces one email with up to four tables: **EMD issuance time limits**,
**ticketing deadlines**, **IATA payments due** and **agent money due** (the last
two added 2026-09-22). They are separate tables on purpose — an issuance time
limit and a remittance day in one column under one heading is the confusion the
2026-09-21 correction was about, and agent money is owed *to* the company rather
than *by* it. All four use the same window: **today through two days out, future
only**. Overdue items are never emailed; they stay on the dashboard and, for
payments, on `/iata` (owner rule, 2026-08-25).

The email **never writes to an airline or an agent** — it goes to
`STAFF_ALERT_EMAILS` only. Sending an agent their notice is a human click on
`/agents/[id]`, restricted to that agent's recorded contact addresses.

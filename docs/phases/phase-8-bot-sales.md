# Phase 8 — Selling to customers through the WhatsApp bot

Goal: staff put seats on sale at a price, and the external WhatsApp bot sells
them — holding seats while a customer pays, reporting the payment, and releasing
what goes unpaid.

The bot is a **separate system**. It owns the customer conversation, the customer
data and the payment accounting. This system owns the seats. The only thing
crossing the line is seat counts (`decisions.md`, rulings 18–23).

**Prerequisite: Phase 6 Step 4 must be committed.** Until agent-held bookings
carry assignments, "unassigned" means nothing and staff could put agents' seats
on sale.

---

## Step 1 — Allotments and prices

- New `bot_allotments` table: seats on sale per PNR and the all-inclusive
  per-seat price.
- On the PNR detail page (in the seat ownership panel): assign seats to the bot,
  reclaim unsold ones, set and change the price. Head office and branch, branch
  on its own PNRs (ruling 6).
- The ledger rules from Phase 6 apply: an allotment can only take **unassigned**
  seats, and a reclaim can never go below sold + held.
- `/sales`: every PNR with an allotment — seats, price, sold, held, available,
  and margin per seat (price − fare − airline tax).
- Deliverable: 5 of a 30-seat PNR can be put on sale at a price, the page shows
  5 available, and reclaiming them returns the PNR to unassigned.

## Step 2 — API clients

- New `api_clients` table and `scripts/create-api-client.ts`, which prints the
  key **once** and stores only its SHA-256 hash and a short prefix.
- `src/lib/server/api-auth.ts`: look the client up by prefix, compare the hash
  with `timingSafeEqual` (the pattern in the cron route), check the scope, and
  reject an inactive client. Update `last_used_at`.
- `api/v1` must be **excluded from the middleware matcher**, exactly as `api/cron`
  is — a session-less request would otherwise be redirected to `/login` and the
  key check would never run. That bug cost the daily job months of silence
  (`decisions.md`, 2026-09-07).
- Deliverable: a key can be issued, a call with it authenticates, a call without
  one gets 401, and setting `active = false` takes effect immediately.

## Step 3 — Packages and bookings

- `GET /api/v1/packages` — active PNRs with a future outbound date and seats
  available: package id, sector, dates, airline code, price per seat, seats
  available. **No fare, EMD value, investor, agent or airline PNR code.**
- `POST /api/v1/bookings` — hold seats. Fails with 409 when not enough remain.
  `held_until` is 8 hours out.
- `POST /api/v1/bookings/{id}/paid` — held → sold. **Refused once expired**
  (ruling 21).
- `POST /api/v1/bookings/{id}/cancel` — held → cancelled. **Refused once sold**:
  a sold booking is final (ruling 22).
- `GET /api/v1/bookings/{id}` — status and `held_until`.
- Idempotency: unique `(api_client_id, external_ref)`; a retry returns the
  original booking rather than holding twice.
- **Hold expiry is lazy** — an expired hold simply stops counting wherever seats
  are counted. No cron, so nothing can fail to run and leave seats locked.
- Every write locks the PNR row and re-checks the invariant inside the
  transaction, and logs to `activity_log` with `changed_by` null and the client
  named in `new_value`.
- **Never log request bodies** (rule 8).
- Deliverables: concurrent holds for the last seat — exactly one succeeds; the
  same `external_ref` twice — one booking; a hold left 8 hours — the seats come
  back and a late payment is refused.

## Step 4 — Go live

- Rate limiting as a **Vercel Firewall rule** on `/api/v1/*` — no new
  infrastructure, no library.
- `B2C_API_ENABLED` off until: the legacy agent mapping is committed, a key is
  issued to the bot, and prices are set on whatever should be on sale.
- Add to `operations.md`: how to issue and revoke a key, the go-live checklist,
  and the external checks (no key → 401, revoked key → 401, response carries no
  fare or PNR code, anon key → 401 on the new tables).
- Give the bot's developer the endpoint list, the error codes, and the hold rule.
- Deliverable: the bot sells a seat end to end against production, and the seat
  count on the PNR page moves accordingly.

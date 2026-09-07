-- ---------------------------------------------------------------------------
-- Targeted security fix — run once against the live database.
--
--   psql "$DIRECT_URL" -f db/apply-security.sql
--
-- Closes the public exposure of the two SQL views (docs/decisions.md,
-- 2026-09-07 "SQL views bypassed RLS"). These same statements are now part of
-- db/schema.sql, so a fresh database gets them automatically; this file exists
-- only so the LIVE database can be fixed without re-running the whole schema
-- (which would also apply the branches lower(name) index — a separate,
-- owner-gated change).
--
-- Safe to re-run. Wrapped in a transaction: if any statement fails, nothing
-- is applied.
-- ---------------------------------------------------------------------------
begin;

-- 1. RLS on every table. Already enabled on the live database, so this is a
--    no-op there; it matters for any database rebuilt from schema.sql.
alter table licenses     enable row level security;
alter table branches     enable row level security;
alter table airlines     enable row level security;
alter table pnrs         enable row level security;
alter table emd_rounds   enable row level security;
alter table ticketing    enable row level security;
alter table allocations  enable row level security;
alter table activity_log enable row level security;

-- 2. THE ACTUAL FIX. Without security_invoker a view runs with its owner's
--    privileges and bypasses the RLS above, which is why these two views were
--    readable by anyone holding the public anon key.
alter view refunded_emd_rounds set (security_invoker = on);
alter view dashboard_totals   set (security_invoker = on);

-- 3. Belt and braces: with no grant, PostgREST cannot reach them at all.
revoke all on refunded_emd_rounds from anon, authenticated;
revoke all on dashboard_totals   from anon, authenticated;

-- 4. Prove the application itself is unaffected before committing. Prisma
--    connects as `postgres`, which owns these tables and holds BYPASSRLS, so
--    both views must still return rows. If either is empty, something is wrong
--    and this transaction should NOT be committed.
\echo '--- these must both be non-zero ---'
select count(*) as refund_rows_visible_to_app from refunded_emd_rounds;
select active_pnrs from dashboard_totals;

commit;

-- EMD Group Booking Management System — schema
-- Source of truth for TYPES. See docs/data-model.md for the source of truth on MEANING.
-- Claude Code: review this against docs/data-model.md before running any migration based on it.
-- Idempotent: safe to re-run via `npm run db:apply`.
--
-- Two paths must BOTH stay correct, and they are easy to get out of step:
--   1. the `create table` blocks, which only ever run on a fresh database;
--   2. the `alter table`/healing statements, which bring an existing database
--      up to date (`create table if not exists` will not alter a live table).
-- Any column, default, or constraint changed after launch belongs in both.
-- Schema changes applied straight to the live database (or via Prisma) must be
-- mirrored here, or a fresh deployment will not match production.

create extension if not exists "pgcrypto";

create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Branch names are case-insensitive identifiers: "Rawalpindi" and "RAWALPINDI"
-- are the same branch (owner ruling, 2026-09-07). The `unique` above compares
-- text exactly, so it allowed both to exist as separate rows and one real branch
-- ended up split across two records. This index closes that gap.
-- Requires the duplicates to be merged first:
--   npx tsx scripts/merge-duplicate-branches.ts --commit
create unique index if not exists idx_branches_name_lower on branches (lower(name));

create table if not exists airlines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact_emails text[],
  created_at timestamptz not null default now()
);

create table if not exists pnrs (
  id uuid primary key default gen_random_uuid(),
  sr_no serial not null,
  request_date date not null,
  investor_company text not null,
  license_id uuid references licenses(id),
  branch_id uuid references branches(id),
  parent_pnr_id uuid references pnrs(id),
  pnr text not null,
  gds_pnr text,
  segment text,
  airline_id uuid references airlines(id),
  seats integer not null check (seats >= 0),
  outbound_date date,
  inbound_date date,
  sector text,
  pnr_tl_date date,
  deal_pct numeric(5,2),
  issued_status text not null default 'unissued' check (issued_status in ('issued','unissued')),
  airline_taxes numeric(12,2),
  psf numeric(12,2),
  fare numeric(12,2) not null,
  total_emd_value numeric(14,2) generated always as (seats * fare) stored,
  status text not null default 'active' check (status in ('active','cancelled','completed')),
  raw_airline_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists idx_pnrs_parent on pnrs(parent_pnr_id);
create index if not exists idx_pnrs_status on pnrs(status);
create index if not exists idx_pnrs_pnr on pnrs(pnr);

create table if not exists emd_rounds (
  id uuid primary key default gen_random_uuid(),
  pnr_id uuid not null references pnrs(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  issuance_date date not null,
  -- time the EMD was actually issued; a round's deadline time defaults to it
  -- (docs/decisions.md, 2026-09-07 "EMD Issuance Time and Default Deadline Time")
  issuance_time time,
  payment_pct numeric(5,2) not null,
  emd_number text,
  emd_amount numeric(14,2) not null,
  -- nullable: legacy imports have no time limits; the UI enforces it for new rounds
  deadline_date date,
  deadline_time time,
  -- 'issued' replaced 'pending' (docs/decisions.md, 2026-09-07). Creating a round
  -- in the system IS the act of issuing it, which starts the clock to the deadline.
  status text not null default 'issued' check (status in ('issued','paid','refund_requested','refunded','expired')),
  refund_amount numeric(14,2),
  refund_date date,
  -- which license actually paid for THIS round; rounds of one PNR may differ
  -- (docs/decisions.md, 2026-09-07 "License Tracking per EMD Round")
  license_id uuid references licenses(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pnr_id, round_number)
);

-- ---------------------------------------------------------------------------
-- Healing section — brings a database created by an EARLIER version of this
-- file up to the definition above. `create table if not exists` never alters
-- an existing table, so every post-launch column/constraint change must also
-- appear here. Each statement is a no-op on an already-current database.
-- ---------------------------------------------------------------------------

alter table emd_rounds add column if not exists issuance_time time;
alter table emd_rounds add column if not exists license_id uuid
  references licenses(id) on update cascade on delete set null;

-- The 'pending' -> 'issued' rename (docs/decisions.md, 2026-09-07), in the only
-- order that works. The old constraint must come off FIRST: while it is still in
-- force it permits 'pending' and rejects 'issued', so rewriting the rows before
-- dropping it fails. Then the rows are renamed, and only then can the new
-- constraint be added — it would refuse to validate against leftover 'pending'.
alter table emd_rounds drop constraint if exists emd_rounds_status_check;
update emd_rounds set status = 'issued' where status = 'pending';
alter table emd_rounds alter column status set default 'issued';
alter table emd_rounds add constraint emd_rounds_status_check
  check (status in ('issued','paid','refund_requested','refunded','expired'));

create index if not exists idx_emd_rounds_pnr on emd_rounds(pnr_id);
create index if not exists idx_emd_rounds_status on emd_rounds(status);

-- Partial index for the daily deadline job. Dropped first because
-- `create index if not exists` would keep an older index of the same name whose
-- predicate still says status = 'pending' — which now matches zero rows, leaving
-- the alert query unindexed.
drop index if exists idx_emd_rounds_deadline;
create index idx_emd_rounds_deadline on emd_rounds(deadline_date) where status = 'issued';

create table if not exists ticketing (
  pnr_id uuid primary key references pnrs(id) on delete cascade,
  name_update_deadline date,
  ticket_issuance_deadline date,
  status text,
  tickets_issued integer,
  balance_tickets integer
);

create table if not exists allocations (
  id uuid primary key default gen_random_uuid(),
  parent_pnr_id uuid not null references pnrs(id) on delete cascade,
  child_pnr_id uuid not null references pnrs(id) on delete cascade,
  seats_allocated integer not null check (seats_allocated > 0),
  created_at timestamptz not null default now(),
  check (parent_pnr_id <> child_pnr_id)
);

create index if not exists idx_allocations_parent on allocations(parent_pnr_id);
create index if not exists idx_allocations_child on allocations(child_pnr_id);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  field_name text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists idx_activity_log_record on activity_log(table_name, record_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
--
-- Supabase publishes every table in the `public` schema through its PostgREST
-- API, authorised by the anon key — and that key ships publicly in the browser
-- bundle (NEXT_PUBLIC_SUPABASE_ANON_KEY). RLS is the ONLY thing standing
-- between that key and this data.
--
-- The application never reads data through PostgREST: Prisma connects as
-- `postgres`, which owns these tables and holds BYPASSRLS, so turning RLS on
-- costs the app nothing. Every table gets RLS enabled with NO policies, which
-- denies `anon` and `authenticated` completely. Authorisation stays where it
-- already lives — the app layer, src/lib/auth.ts.
--
-- This MUST be stated explicitly: `create table` leaves RLS off, so a database
-- rebuilt from this file without these lines comes up world-readable AND
-- world-writable (anon holds SELECT and INSERT by default on this project).
-- Re-running is a no-op.
-- ---------------------------------------------------------------------------
alter table licenses     enable row level security;
alter table branches     enable row level security;
alter table airlines     enable row level security;
alter table pnrs         enable row level security;
alter table emd_rounds   enable row level security;
alter table ticketing    enable row level security;
alter table allocations  enable row level security;
alter table activity_log enable row level security;


-- Refund log view — NOT a separate table (see docs/decisions.md, 2026-08-21 entry)
-- Columns are listed explicitly rather than using `er.*`: with a wildcard, adding
-- any column to emd_rounds silently changes this view's column ORDER, and
-- `create or replace view` cannot rename or reorder existing columns — so
-- re-running this file would fail. Dropped and recreated for the same reason.
drop view if exists refunded_emd_rounds;
-- `security_invoker = on` is load-bearing, not tidiness: without it a view runs
-- with its OWNER's privileges and therefore BYPASSES the RLS on the tables it
-- reads. This view was publicly readable through PostgREST for exactly that
-- reason (docs/decisions.md, 2026-09-07 "SQL views bypassed RLS").
create view refunded_emd_rounds with (security_invoker = on) as
select
  er.id, er.pnr_id, er.round_number, er.issuance_date, er.issuance_time,
  er.payment_pct, er.emd_number, er.emd_amount, er.deadline_date, er.deadline_time,
  er.status, er.refund_amount, er.refund_date, er.license_id,
  er.created_at, er.updated_at,
  p.pnr, p.gds_pnr, p.sector, p.seats, p.outbound_date,
  a.code as airline_code, b.name as branch_name
from emd_rounds er
join pnrs p on p.id = er.pnr_id
left join airlines a on a.id = p.airline_id
left join branches b on b.id = p.branch_id
where er.status = 'refunded';

-- Dashboard totals view (mirrors the totals row at the top of the old sheet).
-- Scoped to active PNRs, matching the other columns.
-- total_paid = EMD amounts actually paid out (gross, incl. rounds later refunded);
-- total_refunded = amounts returned by the airline. Recorded as separate facts,
-- never netted (see docs/business-rules.md).
create or replace view dashboard_totals with (security_invoker = on) as
select
  (select count(*) from pnrs where status = 'active') as active_pnrs,
  (select coalesce(sum(seats), 0) from pnrs where status = 'active') as total_seats,
  (select coalesce(sum(total_emd_value), 0) from pnrs where status = 'active') as total_emd_value,
  (select coalesce(sum(er.emd_amount), 0)
     from emd_rounds er join pnrs p on p.id = er.pnr_id
    where p.status = 'active' and er.status in ('paid', 'refund_requested', 'refunded')) as total_paid,
  (select coalesce(sum(er.refund_amount), 0)
     from emd_rounds er join pnrs p on p.id = er.pnr_id
    where p.status = 'active' and er.status = 'refunded') as total_refunded;

-- Belt and braces alongside `security_invoker`: with no grant at all, PostgREST
-- cannot reach these views even if the option is ever lost. Guarded by a role
-- check so this file still applies to a plain Postgres without Supabase roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on refunded_emd_rounds from anon';
    execute 'revoke all on dashboard_totals from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on refunded_emd_rounds from authenticated';
    execute 'revoke all on dashboard_totals from authenticated';
  end if;
end $$;

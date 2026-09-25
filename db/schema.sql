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
-- The duplicates it guards against were merged on 2026-09-07 (the merge script
-- is retired; see docs/operations.md, "Retired one-off scripts").
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
  -- Two statuses only (owner ruling, 2026-09-21). A round is ISSUED — which is
  -- what secures the PNR — until the airline REFUNDS it. 'paid',
  -- 'refund_requested' and 'expired' were removed: when an EMD is paid is an
  -- IATA matter this system does not model yet, and a status nobody can define
  -- is a status that gets set by guesswork.
  status text not null default 'issued' check (status in ('issued','refunded')),
  refund_amount numeric(14,2),
  refund_date date,
  -- The day this EMD was PAID to IATA. Added 2026-09-22 with the IATA
  -- remittance calendar (src/lib/iata-calendar.ts). It is deliberately NOT a
  -- status: payment is a separate axis from `status`, because an EMD that has
  -- been paid is still held by the airline and still 'issued'. Folding payment
  -- into `status` is what made the old 'paid' value wrong, and it was removed
  -- on 2026-09-21. Null means unpaid; the deadline comes from the calendar.
  payment_date date,
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

-- Note on the selling-side tables (`agents`, phase 6): a brand-NEW table needs
-- nothing here. `create table if not exists` does create it on an existing
-- database — what it cannot do is ALTER one. The moment a column is added to
-- `agents` after it ships, that column belongs here as well as above.

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
-- Statuses reduced to two (owner ruling, 2026-09-21). Any row still carrying a
-- removed status is mapped first, or the constraint cannot be validated:
--   paid / refund_requested / expired -> issued (the EMD is still with the
--   airline; none of them mean the deposit came back).
update emd_rounds set status = 'issued'
  where status in ('paid', 'refund_requested', 'expired');
alter table emd_rounds add constraint emd_rounds_status_check
  check (status in ('issued','refunded'));

-- IATA payment tracking (2026-09-22). Nullable with no default and no
-- backfill: a null here means "we have not recorded paying this", which is the
-- truth for every round that existed before the calendar was loaded. Guessing
-- a payment date from the calendar would fabricate a settlement that may never
-- have happened.
alter table emd_rounds add column if not exists payment_date date;

create index if not exists idx_emd_rounds_pnr on emd_rounds(pnr_id);
create index if not exists idx_emd_rounds_status on emd_rounds(status);

-- Drives the IATA settlement view and the payment half of the daily alert:
-- EMDs with no recorded payment, ordered by when they were issued (which is
-- what places them in a billing period).
--
-- The predicate deliberately does NOT include status = 'issued'. A round
-- refunded AFTER its billing window closed was still billed and is still owed
-- (owner correction, 2026-09-22), so refunded rows must stay in the index.
-- Dropped first for the same reason as idx_emd_rounds_deadline above:
-- `create index if not exists` would keep an older index of this name whose
-- predicate still carries the status clause, leaving those rows unindexed.
drop index if exists idx_emd_rounds_unpaid;
create index idx_emd_rounds_unpaid
  on emd_rounds(issuance_date) where payment_date is null;

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
-- Selling side (phase 6+). See docs/data-model.md and docs/business-rules.md.
--
-- Agents are the travel agents that seats are handed over to. They are RECORDS,
-- NOT user accounts — agents never log in (owner ruling, 2026-09-16).
-- ---------------------------------------------------------------------------
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Lower-cased, trimmed `name`. Unique, so one agent cannot exist twice under
  -- two spellings — the exact failure that split "Rawalpindi" from "RAWALPINDI"
  -- across two branch rows and hid 392 bookings from the branch that owned them
  -- (docs/decisions.md, 2026-09-07). Written by the app, never typed.
  name_key text not null unique,
  b2b_code text,
  contact_emails text[] not null default '{}',
  contact_phone text,
  -- Which branch created this agent. NULL = head office. Head office sees every
  -- agent; a branch sees only its own (owner ruling, 2026-09-17).
  created_by_branch_id uuid references branches(id) on update cascade on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_agents_branch on agents(created_by_branch_id);
create index if not exists idx_agents_active on agents(active);

-- Seats of one PNR held by one agent, with that agent's commercial terms.
-- Several rows per PNR are normal: one PNR can be shared between agents.
--
-- The money columns are written here and only USED in phase 7. They live on the
-- assignment, not on the PNR, because two agents on the same PNR can be given
-- different terms (owner ruling, 2026-09-17).
create table if not exists agent_assignments (
  id uuid primary key default gen_random_uuid(),
  pnr_id uuid not null references pnrs(id) on delete cascade,
  agent_id uuid not null references agents(id),
  seats integer not null check (seats > 0),
  charge_type text not null default 'none' check (charge_type in ('none','pct','per_seat')),
  charge_value numeric(12,2),
  discount_type text not null default 'none' check (discount_type in ('none','pct','per_seat')),
  discount_value numeric(12,2),
  charge_tax boolean not null default false,
  assigned_at timestamptz not null default now(),
  assigned_by uuid,
  -- Set when seats are taken back. A released row stays as history and stops
  -- counting against the ledger; it is never deleted.
  released_at timestamptz,
  -- A charge and a discount are never both set (owner ruling, 2026-09-17).
  -- Enforced here as well as in the app: this is a money rule, and the database
  -- is the only place that cannot be bypassed.
  constraint agent_assignments_charge_xor_discount
    check (charge_type = 'none' or discount_type = 'none'),
  -- A type without its value, or a value without its type, is a half-saved term.
  constraint agent_assignments_charge_value_present
    check ((charge_type = 'none') = (charge_value is null)),
  constraint agent_assignments_discount_value_present
    check ((discount_type = 'none') = (discount_value is null))
);

create index if not exists idx_agent_assignments_pnr on agent_assignments(pnr_id);
create index if not exists idx_agent_assignments_agent on agent_assignments(agent_id);
-- The ledger only ever sums LIVE assignments, so the index matches that query.
create index if not exists idx_agent_assignments_live
  on agent_assignments(pnr_id) where released_at is null;

-- Money actually received from an agent against one assignment. "Recovery" is
-- the company's own word for it (phase 7 step 2).
--
-- There is no stored balance anywhere: outstanding is the agent's calculated
-- total minus the sum of these rows. A stored balance goes stale the moment a
-- charge, a discount or the seat count changes, and then two screens disagree.
create table if not exists agent_recoveries (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references agent_assignments(id) on delete cascade,
  -- A payment is money that arrived, so it is positive. A correction is made by
  -- deleting the row (head office only, and logged), never by recording a
  -- negative payment that would read as a refund to the agent.
  amount numeric(14,2) not null check (amount > 0),
  received_date date not null,
  method text,
  -- The agent's payment reference (cheque number, transfer id). Shown to staff,
  -- NEVER written to activity_log — CLAUDE.md rule 8, no payment references in
  -- log lines.
  reference text,
  recorded_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_recoveries_assignment on agent_recoveries(assignment_id);
create index if not exists idx_agent_recoveries_date on agent_recoveries(received_date);

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
alter table agents       enable row level security;
alter table agent_assignments enable row level security;
alter table agent_recoveries enable row level security;


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

-- The `dashboard_totals` view was DROPPED on 2026-09-24. The dashboard stopped
-- reading it on 2026-09-09, when its cards began totalling the filtered rows in
-- the browser (`src/lib/dashboard.ts`); the view then sat unused, one more object
-- that had to be kept revoked from the public API roles. `drop ... if exists`
-- is both the create path (a fresh database never gets it) and the healing path
-- (an existing one loses it).
drop view if exists dashboard_totals;

-- Belt and braces alongside `security_invoker`: with no grant at all, PostgREST
-- cannot reach these views even if the option is ever lost. Guarded by a role
-- check so this file still applies to a plain Postgres without Supabase roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on refunded_emd_rounds from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on refunded_emd_rounds from authenticated';
  end if;
end $$;

-- EMD Group Booking Management System — schema
-- Source of truth for TYPES. See docs/data-model.md for the source of truth on MEANING.
-- Claude Code: review this against docs/data-model.md before running any migration based on it.

create extension if not exists "pgcrypto";

create table licenses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table airlines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact_emails text[],
  created_at timestamptz not null default now()
);

create table pnrs (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index idx_pnrs_parent on pnrs(parent_pnr_id);
create index idx_pnrs_status on pnrs(status);
create index idx_pnrs_pnr on pnrs(pnr);

create table emd_rounds (
  id uuid primary key default gen_random_uuid(),
  pnr_id uuid not null references pnrs(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  issuance_date date not null,
  payment_pct numeric(5,2) not null,
  emd_number text,
  emd_amount numeric(14,2) not null,
  deadline_date date not null,
  deadline_time time,
  status text not null default 'pending' check (status in ('pending','paid','refund_requested','refunded','expired')),
  refund_amount numeric(14,2),
  refund_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pnr_id, round_number)
);

create index idx_emd_rounds_pnr on emd_rounds(pnr_id);
create index idx_emd_rounds_deadline on emd_rounds(deadline_date) where status = 'pending';
create index idx_emd_rounds_status on emd_rounds(status);

create table ticketing (
  pnr_id uuid primary key references pnrs(id) on delete cascade,
  name_update_deadline date,
  ticket_issuance_deadline date,
  status text,
  tickets_issued integer,
  balance_tickets integer
);

create table allocations (
  id uuid primary key default gen_random_uuid(),
  parent_pnr_id uuid not null references pnrs(id) on delete cascade,
  child_pnr_id uuid not null references pnrs(id) on delete cascade,
  seats_allocated integer not null check (seats_allocated > 0),
  created_at timestamptz not null default now(),
  check (parent_pnr_id <> child_pnr_id)
);

create index idx_allocations_parent on allocations(parent_pnr_id);
create index idx_allocations_child on allocations(child_pnr_id);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  field_name text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index idx_activity_log_record on activity_log(table_name, record_id);

-- Refund log view — NOT a separate table (see docs/decisions.md, 2026-08-21 entry)
create view refunded_emd_rounds as
select er.*, p.pnr, p.gds_pnr, p.sector, p.seats, p.outbound_date, a.code as airline_code, b.name as branch_name
from emd_rounds er
join pnrs p on p.id = er.pnr_id
left join airlines a on a.id = p.airline_id
left join branches b on b.id = p.branch_id
where er.status = 'refunded';

-- Dashboard totals view (mirrors the totals row at the top of the old sheet)
create view dashboard_totals as
select
  count(*) filter (where status = 'active') as active_pnrs,
  coalesce(sum(seats) filter (where status = 'active'), 0) as total_seats,
  coalesce(sum(total_emd_value) filter (where status = 'active'), 0) as total_emd_value
from pnrs;

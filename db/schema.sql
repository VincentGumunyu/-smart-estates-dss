-- Supabase/PostgreSQL schema for Smart Estates DSS
create extension if not exists pgcrypto;

create table if not exists public.tuckshops (
  id uuid primary key default gen_random_uuid(),
  kiosk_id text,
  kiosk_number integer,
  lessee_name text not null,
  date_signed date,
  location text,
  operational_status text,
  lease_status text,
  monthly_rental_usd numeric(10,2) default 57.50,
  arrears_usd numeric(12,2),
  account_number text,
  comments text,
  tenant_name text,
  payment_date date,
  amount_paid numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Second workbook (Book2.xlsx) normalized table
create table if not exists public.tuckshops_book2 (
  id uuid primary key default gen_random_uuid(),
  lessee_name text,
  kiosk_number integer,
  date_signed date,
  location text,
  operational_status text,
  lease_status text,
  col6 text,
  col7 text,
  col8 text,
  source_row_hash text unique,
  created_at timestamptz not null default now()
);

-- Required for upsert(..., on_conflict="kiosk_number")
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tuckshops_kiosk_number_key'
  ) then
    alter table public.tuckshops
      add constraint tuckshops_kiosk_number_key unique (kiosk_number);
  end if;
end
$$;

create index if not exists idx_tuckshops_lease_status on public.tuckshops (lease_status);
create index if not exists idx_tuckshops_operational_status on public.tuckshops (operational_status);
create index if not exists idx_tuckshops_location on public.tuckshops (location);
create index if not exists idx_book2_kiosk on public.tuckshops_book2 (kiosk_number);
create index if not exists idx_book2_lease_status on public.tuckshops_book2 (lease_status);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tuckshops_updated_at on public.tuckshops;
create trigger trg_tuckshops_updated_at
before update on public.tuckshops
for each row execute function public.set_updated_at();

-- Normalize lessee names for matching/reporting (keeps raw rows intact)
create or replace function public.normalize_lessee_name(v text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(trim(coalesce(v, ''))), '\s+', ' ', 'g'), '');
$$;

-- Reporting view: grouped summary by normalized lessee name (master table)
create or replace view public.v_tuckshops_by_lessee_name as
select
  public.normalize_lessee_name(t.lessee_name) as lessee_name_norm,
  count(*) as rows_count,
  count(distinct t.kiosk_number) filter (where t.kiosk_number is not null) as kiosks_count,
  sum(coalesce(t.arrears_usd, 0))::numeric(12,2) as total_arrears_usd,
  max(t.updated_at) as last_updated_at
from public.tuckshops t
where public.normalize_lessee_name(t.lessee_name) is not null
group by public.normalize_lessee_name(t.lessee_name);

-- Reporting view: grouped summary combining master + Book2 by normalized lessee name
create or replace view public.v_tuckshops_combined_by_lessee_name as
with a as (
  select
    public.normalize_lessee_name(lessee_name) as lessee_name_norm,
    count(*) as main_rows,
    count(distinct kiosk_number) filter (where kiosk_number is not null) as main_kiosks,
    sum(coalesce(arrears_usd, 0))::numeric(12,2) as main_total_arrears_usd
  from public.tuckshops
  where public.normalize_lessee_name(lessee_name) is not null
  group by 1
),
b as (
  select
    public.normalize_lessee_name(lessee_name) as lessee_name_norm,
    count(*) as book2_rows,
    count(distinct kiosk_number) filter (where kiosk_number is not null) as book2_kiosks
  from public.tuckshops_book2
  where public.normalize_lessee_name(lessee_name) is not null
  group by 1
)
select
  coalesce(a.lessee_name_norm, b.lessee_name_norm) as lessee_name_norm,
  coalesce(a.main_rows, 0) as main_rows,
  coalesce(a.main_kiosks, 0) as main_kiosks,
  coalesce(a.main_total_arrears_usd, 0)::numeric(12,2) as main_total_arrears_usd,
  coalesce(b.book2_rows, 0) as book2_rows,
  coalesce(b.book2_kiosks, 0) as book2_kiosks
from a
full outer join b using (lessee_name_norm);

-- Enable RLS
alter table public.tuckshops enable row level security;
alter table public.tuckshops_book2 enable row level security;

-- Authenticated users can read (dashboard)
drop policy if exists "auth_select_tuckshops" on public.tuckshops;
create policy "auth_select_tuckshops"
on public.tuckshops
for select
using (auth.role() = 'authenticated');

drop policy if exists "service_role_all_tuckshops" on public.tuckshops;
create policy "service_role_all_tuckshops"
on public.tuckshops
for all
to service_role
using (true)
with check (true);

drop policy if exists "auth_select_tuckshops_book2" on public.tuckshops_book2;
create policy "auth_select_tuckshops_book2"
on public.tuckshops_book2
for select
using (auth.role() = 'authenticated');

drop policy if exists "service_role_all_tuckshops_book2" on public.tuckshops_book2;
create policy "service_role_all_tuckshops_book2"
on public.tuckshops_book2
for all
to service_role
using (true)
with check (true);

-- NOTE: keep writes restricted to service role/import scripts by default.
-- -------------------------------------------------------------------------
-- Payments: transaction history + receipt support
-- -------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  kiosk_number integer not null,
  lessee_name text not null,
  payment_type text,
  payment_date date,
  amount_usd numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

-- Allow dashboard to record payments and to view the receipt history
drop policy if exists "auth_select_payments" on public.payments;
create policy "auth_select_payments"
on public.payments
for select
to authenticated
using (true);

drop policy if exists "auth_insert_payments" on public.payments;
create policy "auth_insert_payments"
on public.payments
for insert
to authenticated
with check (true);

drop policy if exists "service_role_all_payments" on public.payments;
create policy "service_role_all_payments"
on public.payments
for all
to service_role
using (true)
with check (true);

-- -------------------------------------------------------------------------
-- Allow dashboard writes to tuckshops (needed for updating payment fields)
-- -------------------------------------------------------------------------

drop policy if exists "auth_update_tuckshops" on public.tuckshops;
create policy "auth_update_tuckshops"
on public.tuckshops
for update
to authenticated
using (true)
with check (true);

-- -------------------------------------------------------------------------
-- Monthly rent charging (adds monthly rental to arrears, once per month)
-- -------------------------------------------------------------------------

create table if not exists public.rent_charges (
  id uuid primary key default gen_random_uuid(),
  kiosk_number integer not null,
  charge_month date not null, -- first day of month
  amount_usd numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint rent_charges_unique unique (kiosk_number, charge_month)
);

alter table public.rent_charges enable row level security;

drop policy if exists "auth_select_rent_charges" on public.rent_charges;
create policy "auth_select_rent_charges"
on public.rent_charges
for select
to authenticated
using (true);

drop policy if exists "service_role_all_rent_charges" on public.rent_charges;
create policy "service_role_all_rent_charges"
on public.rent_charges
for all
to service_role
using (true)
with check (true);

create or replace function public.apply_monthly_rent_charges(p_for_month date default date_trunc('month', now())::date)
returns integer
language plpgsql
security definer
as $$
declare
  v_month date := date_trunc('month', p_for_month)::date;
  v_inserted int := 0;
begin
  -- Insert one charge per kiosk for the target month (skip if already charged)
  with ins as (
    insert into public.rent_charges (kiosk_number, charge_month, amount_usd)
    select
      t.kiosk_number,
      v_month as charge_month,
      coalesce(t.monthly_rental_usd, 57.50)::numeric(12,2) as amount_usd
    from public.tuckshops t
    where
      t.kiosk_number is not null
      and public.normalize_lessee_name(t.lessee_name) is not null
      and coalesce(t.lease_status, '') not ilike '%EXPIRED%'
    on conflict (kiosk_number, charge_month) do nothing
    returning kiosk_number, amount_usd
  )
  select count(*) into v_inserted from ins;

  -- Update arrears for the kiosks we just charged
  update public.tuckshops t
  set arrears_usd = coalesce(t.arrears_usd, 0) + c.amount_usd
  from public.rent_charges c
  where
    c.charge_month = v_month
    and c.kiosk_number = t.kiosk_number;

  return v_inserted;
end;
$$;

-- Optional: schedule month-end charge (requires pg_cron enabled in your Supabase project).
-- Example (run in Supabase SQL editor once):
-- select cron.schedule(
--   'month_end_rent_charge',
--   '5 23 L * *',
--   $$select public.apply_monthly_rent_charges(date_trunc('month', now())::date);$$
-- );

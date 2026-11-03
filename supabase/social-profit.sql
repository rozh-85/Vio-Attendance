-- Profit on social media orders
--
-- The Profit tab of /rozhadmin/orders keeps three things here:
--   social_model_costs  what one piece of each item model costs Vio
--   social_order_costs  an order's own cost, over its model's (two pieces,
--                       a different supplier price …)
--   social_sponsors     paid sponsored posts / ads and the days they ran
--
-- Net profit = sales − cost of the goods − sponsors. Only signed-in
-- supervisors reach these tables, and the app shows them only behind the
-- owner password. Sellers use the anon key and can read none of it — their
-- order page never learns what a model cost or what a sponsor was paid.
--
-- Run once in the Supabase SQL editor, after social-orders.sql. Safe to run
-- again. Nothing in social_orders changes.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.social_model_costs (
  -- The model with spaces, dots and dashes taken out and in capitals, so
  -- "V.502", "v 502" and "V-502" share one cost. The app makes the key.
  model_key   text primary key check (btrim(model_key) <> ''),
  -- As the owner saw it written when setting the cost.
  model_label text not null default '',
  cost        numeric(14, 0) not null check (cost >= 0),
  updated_at  timestamptz not null default now()
);

create table if not exists public.social_order_costs (
  order_id   uuid primary key references public.social_orders(id) on delete cascade,
  cost       numeric(14, 0) not null check (cost >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_sponsors (
  id         uuid primary key default gen_random_uuid(),
  platform   text not null default '',
  start_date date not null,
  end_date   date not null,
  -- As paid: dollars or dinars. The IQD value is amount × rate.
  amount     numeric(14, 2) not null check (amount > 0),
  currency   text not null default 'IQD' check (currency in ('IQD', 'USD')),
  -- IQD for one dollar; 1 for a sponsor paid in IQD.
  rate       numeric(12, 2) not null default 1 check (rate > 0),
  -- The model or product it promoted, if any.
  promoted   text not null default '',
  note       text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists social_sponsors_dates_idx
  on public.social_sponsors (start_date, end_date);

-- ── Who may read and change what ────────────────────────────────────────────
-- The same rule as the orders: every signed-in account except the
-- feedback-only one. Nothing for anon.
alter table public.social_model_costs enable row level security;
alter table public.social_order_costs enable row level security;
alter table public.social_sponsors    enable row level security;

drop policy if exists social_model_costs_supervisor on public.social_model_costs;
create policy social_model_costs_supervisor
  on public.social_model_costs for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');

drop policy if exists social_order_costs_supervisor on public.social_order_costs;
create policy social_order_costs_supervisor
  on public.social_order_costs for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');

drop policy if exists social_sponsors_supervisor on public.social_sponsors;
create policy social_sponsors_supervisor
  on public.social_sponsors for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');

revoke all on public.social_model_costs from public, anon, authenticated;
revoke all on public.social_order_costs from public, anon, authenticated;
revoke all on public.social_sponsors    from public, anon, authenticated;

grant select, insert, update, delete on public.social_model_costs to authenticated;
grant select, insert, update, delete on public.social_order_costs to authenticated;
grant select, insert, update, delete on public.social_sponsors    to authenticated;

notify pgrst, 'reload schema';

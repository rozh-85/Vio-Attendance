-- Profit on social media orders
--
-- The Profit pages of /rozhadmin/profit keep four things here:
--   social_model_costs      the owner's products: model, name, picture, type
--                           and what one piece costs Vio
--   product-images          (storage) the pictures uploaded on Add from
--                           pictures
--   social_order_costs      an order's own cost, over its product's (set by
--                           the owner, or kept when a product's cost changes
--                           so orders already sold keep their profit)
--   social_sponsors         paid sponsored posts / ads and the days they ran
--   social_profit_settings  the first day whose orders count
--
-- Net profit = sales − cost of the goods − sponsors. Sellers write the model
-- and their own price on each order. Only signed-in supervisors reach these
-- tables, and the app shows them only behind the owner password. Sellers use
-- the anon key: social_price_list() below gives them the products' models,
-- names, types and pictures to suggest as they write — never a cost, and
-- nothing about sponsors.
--
-- Run once in the Supabase SQL editor, after social-orders.sql. Safe to run
-- again — run the whole file again after it changes. Nothing in
-- social_orders changes.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.social_model_costs (
  -- The model with spaces, dots and dashes taken out and in capitals, so
  -- "V.502", "v 502" and "V-502" share one cost. The app makes the key.
  model_key   text primary key check (btrim(model_key) <> ''),
  -- As the owner saw it written when setting the cost.
  model_label text not null default '',
  -- What one piece costs Vio; null until the owner writes it.
  cost        numeric(14, 0) check (cost >= 0),
  -- No longer used: sellers write their own price on each order.
  sale_price  numeric(14, 0) check (sale_price >= 0),
  -- The item type orders of it are saved under (هیتەر, چوپەر …).
  category    text not null default '',
  -- Suggested to sellers on the order form.
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- Databases set up before prices were kept here.
alter table public.social_model_costs alter column cost drop not null;
alter table public.social_model_costs add column if not exists sale_price numeric(14, 0)
  check (sale_price >= 0);
alter table public.social_model_costs add column if not exists category text not null default '';
alter table public.social_model_costs add column if not exists active boolean not null default true;
-- Products: a name and picture ('' uses the app's own catalogue), and when
-- it joined the list. The sale price above is no longer used — sellers write
-- their own price.
alter table public.social_model_costs add column if not exists name text not null default '';
alter table public.social_model_costs add column if not exists image_url text not null default '';
alter table public.social_model_costs add column if not exists created_at timestamptz not null default now();

-- One row: orders from this day on count in the profit; older ones do not.
create table if not exists public.social_profit_settings (
  id         boolean primary key default true check (id),
  starts_on  date,
  updated_at timestamptz not null default now()
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
alter table public.social_profit_settings enable row level security;

drop policy if exists social_profit_settings_supervisor on public.social_profit_settings;
create policy social_profit_settings_supervisor
  on public.social_profit_settings for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');

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
revoke all on public.social_profit_settings from public, anon, authenticated;

grant select, insert, update, delete on public.social_model_costs to authenticated;
grant select, insert, update, delete on public.social_order_costs to authenticated;
grant select, insert, update, delete on public.social_sponsors    to authenticated;
grant select, insert, update, delete on public.social_profit_settings to authenticated;

-- ── Seller: the product list ────────────────────────────────────────────────
-- The owner's products, with name, type and picture, suggested on the order
-- form as the seller writes the model. Never the cost.
create or replace function public.social_price_list(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account public.social_accounts;
begin
  v_account := public.social_session_account(p_token);
  if v_account.id is null then
    raise exception 'SESSION_EXPIRED';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', m.model_key,
             'model', m.model_label,
             'name', m.name,
             'category', m.category,
             'image', m.image_url)
           order by m.model_label)
      from public.social_model_costs as m
     where m.active
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.social_price_list(text) from public;
grant execute on function public.social_price_list(text) to anon, authenticated;

-- ── Product pictures ────────────────────────────────────────────────────────
-- Uploaded on the Add from pictures page. Anyone with a picture's address can
-- see it (sellers' phones load them), but only signed-in supervisors add or
-- remove pictures.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects for select to authenticated
  using (bucket_id = 'product-images');
drop policy if exists product_images_write on storage.objects;
create policy product_images_write on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images'
              and lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');
drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images'
         and lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');

notify pgrst, 'reload schema';

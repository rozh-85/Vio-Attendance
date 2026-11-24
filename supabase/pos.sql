-- Point of sale (/pos)
--
-- The till at /pos has no sign-in: whoever has the link can sell, look up past
-- sales, take returns, and edit or delete a sale. It reaches the sales only
-- through the functions below, never the table itself. Nothing is ever lost:
-- a deleted sale is only marked deleted, and every edit and return is written
-- in the sale's history. The owner sees all of it at /rozhadmin/pos, and can
-- put a deleted sale back.
--
-- Every sale is in dinars and paid in cash; a sale needs the customer's name
-- and mobile. The price list is in dollars, turned into dinars at one dollar
-- rate for every till. Any till may change that rate; the prices themselves and
-- the other settings are changed only by a signed-in supervisor.
--
-- Run once in the Supabase SQL editor, after schema.sql. Safe to run again —
-- run the whole file again after it changes. Until it is run, the till keeps
-- its sales on the device and sends them here by itself afterwards.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.pos_sales (
  -- Made by the till, so sending the same sale twice never saves it twice.
  id               uuid primary key,
  -- Printed on the invoice.
  sale_no          bigint generated always as identity (start with 1001) unique,
  -- Printed instead when the till was offline: T-4F9A2C.
  ref              text not null default '',
  sold_at          timestamptz not null default now(),
  seller           text not null default '',
  customer_name    text not null default '',
  customer_phone   text not null default '',
  customer_address text not null default '',
  note             text not null default '',
  -- [{id, itemId, code, name, ku, category, color, image, qty,
  --   price: dinars for one piece as sold, discount: dinars off the line,
  --   list: dinars for one piece that day, regular: the same with no offer,
  --   usd: dollars for one piece that day}]
  lines            jsonb not null,
  -- Dinars: the pieces at their prices, the discounts, and what was paid.
  subtotal         numeric(14, 0) not null check (subtotal >= 0),
  discount         numeric(14, 0) not null default 0 check (discount >= 0),
  total            numeric(14, 0) not null check (total >= 0),
  -- Dinars for one dollar at the time of the sale.
  rate             numeric(12, 2) not null,
  -- [{id, at, reason, refund, by, lines: [{id, qty}]}]
  returns          jsonb not null default '[]'::jsonb,
  refunded         numeric(14, 0) not null default 0 check (refunded >= 0),
  -- [{at, action, by, note, before}]
  history          jsonb not null default '[]'::jsonb,
  device           text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  delete_reason    text not null default ''
);

create index if not exists pos_sales_sold_idx on public.pos_sales (sold_at desc);
create index if not exists pos_sales_phone_idx on public.pos_sales (customer_phone);

-- The owner's changes to the item list: a new price, a hidden item, a new item.
create table if not exists public.pos_items (
  id         text primary key,
  data       jsonb not null check (pg_column_size(data) < 600000),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_settings (
  id         integer primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Who may read and change what ────────────────────────────────────────────
alter table public.pos_sales    enable row level security;
alter table public.pos_items    enable row level security;
alter table public.pos_settings enable row level security;

revoke all on public.pos_sales    from anon, authenticated;
revoke all on public.pos_items    from anon, authenticated;
revoke all on public.pos_settings from anon, authenticated;

drop policy if exists pos_items_read on public.pos_items;
create policy pos_items_read on public.pos_items for select to anon, authenticated using (true);
drop policy if exists pos_settings_read on public.pos_settings;
create policy pos_settings_read on public.pos_settings for select to anon, authenticated using (true);

drop policy if exists pos_items_supervisor on public.pos_items;
create policy pos_items_supervisor
  on public.pos_items for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');
drop policy if exists pos_settings_supervisor on public.pos_settings;
create policy pos_settings_supervisor
  on public.pos_settings for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');

grant select on public.pos_items, public.pos_settings to anon, authenticated;
grant insert, update, delete on public.pos_items to authenticated;
grant insert, update on public.pos_settings to authenticated;

-- ── Internal: one sale as the app reads it ──────────────────────────────────
create or replace function public.pos_sale_json(s public.pos_sales)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'saleNo', s.sale_no,
    'ref', s.ref,
    'soldAt', s.sold_at,
    'seller', s.seller,
    'customerName', s.customer_name,
    'customerPhone', s.customer_phone,
    'customerAddress', s.customer_address,
    'note', s.note,
    'lines', s.lines,
    'subtotal', s.subtotal,
    'discount', s.discount,
    'total', s.total,
    'rate', s.rate,
    'returns', s.returns,
    'refunded', s.refunded,
    'history', s.history,
    'device', s.device,
    'createdAt', s.created_at,
    'updatedAt', s.updated_at,
    'deletedAt', s.deleted_at,
    'deleteReason', s.delete_reason);
$$;

revoke all on function public.pos_sale_json(public.pos_sales) from public, anon, authenticated;

-- ── Internal: a till's lines, checked and trimmed ───────────────────────────
create or replace function public.pos_clean_lines(p_lines jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_line jsonb;
  v_out  jsonb := '[]'::jsonb;
  v_qty  integer;
  v_price    numeric;
  v_discount numeric;
  v_list     numeric;
  v_regular  numeric;
  v_usd      numeric;
  v_id   text;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) not between 1 and 200 then
    raise exception 'SALE_EMPTY';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    begin
      v_qty      := (v_line ->> 'qty')::integer;
      v_price    := round((v_line ->> 'price')::numeric);
      v_discount := round(coalesce(nullif(v_line ->> 'discount', '')::numeric, 0));
      v_list     := round(coalesce((v_line ->> 'list')::numeric, v_price));
      v_regular  := round(coalesce((v_line ->> 'regular')::numeric, v_list));
      v_usd      := round(coalesce((v_line ->> 'usd')::numeric, 0), 2);
    exception when others then
      raise exception 'SALE_INVALID';
    end;
    v_id := left(btrim(coalesce(v_line ->> 'id', '')), 60);
    if v_id = '' or v_qty is null or v_qty not between 1 and 999
       or v_price is null or v_price not between 0 and 1000000000
       or v_discount not between 0 and v_qty * v_price
       or v_list not between 0 and 1000000000
       or v_regular not between 0 and 1000000000
       or v_usd not between 0 and 1000000
       or btrim(coalesce(v_line ->> 'code', '')) = '' then
      raise exception 'SALE_INVALID';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_id,
      'itemId', left(coalesce(v_line ->> 'itemId', ''), 80),
      'code', left(btrim(v_line ->> 'code'), 60),
      'name', left(btrim(coalesce(v_line ->> 'name', '')), 120),
      'ku', left(btrim(coalesce(v_line ->> 'ku', '')), 120),
      'category', left(coalesce(v_line ->> 'category', ''), 60),
      'color', left(coalesce(v_line ->> 'color', ''), 40),
      'image', left(coalesce(v_line ->> 'image', ''), 200),
      'qty', v_qty,
      'price', v_price,
      'discount', v_discount,
      'list', v_list,
      'regular', v_regular,
      'usd', v_usd));
  end loop;
  return v_out;
end;
$$;

revoke all on function public.pos_clean_lines(jsonb) from public, anon, authenticated;

create or replace function public.pos_lines_sum(p_lines jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum((l ->> 'qty')::integer * (l ->> 'price')::numeric), 0)
    from jsonb_array_elements(p_lines) as l;
$$;

revoke all on function public.pos_lines_sum(jsonb) from public, anon, authenticated;

create or replace function public.pos_lines_discount(p_lines jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum((l ->> 'discount')::numeric), 0)
    from jsonb_array_elements(p_lines) as l;
$$;

revoke all on function public.pos_lines_discount(jsonb) from public, anon, authenticated;

-- A phone as it is kept: digits only.
create or replace function public.pos_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 20);
$$;

revoke all on function public.pos_phone(text) from public, anon, authenticated;

-- ── Till: save a sale ────────────────────────────────────────────────────────
-- A sale already saved (the answer was lost on the way) is returned as it is.
create or replace function public.pos_save(p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_row      public.pos_sales;
  v_lines    jsonb;
  v_subtotal numeric;
  v_discount numeric;
  v_rate     numeric;
  v_sold     timestamptz;
  v_name     text := left(btrim(coalesce(p_sale ->> 'customerName', '')), 120);
  v_phone    text := public.pos_phone(p_sale ->> 'customerPhone');
begin
  begin
    v_id   := (p_sale ->> 'id')::uuid;
    v_rate := nullif(p_sale ->> 'rate', '')::numeric;
    v_sold := coalesce(nullif(p_sale ->> 'soldAt', '')::timestamptz, now());
  exception when others then
    raise exception 'SALE_INVALID';
  end;
  if v_id is null then
    raise exception 'SALE_INVALID';
  end if;

  select * into v_row from public.pos_sales where id = v_id;
  if found then
    return public.pos_sale_json(v_row);
  end if;

  v_lines    := public.pos_clean_lines(p_sale -> 'lines');
  v_subtotal := public.pos_lines_sum(v_lines);
  v_discount := public.pos_lines_discount(v_lines);
  if v_rate is null or v_rate not between 1 and 100000 then
    raise exception 'SALE_INVALID';
  end if;
  if v_name = '' or length(v_phone) < 7 then
    raise exception 'CUSTOMER_REQUIRED';
  end if;
  -- A till that was offline sends the time it sold; never in the future.
  if v_sold > now() + interval '10 minutes' or v_sold < now() - interval '120 days' then
    v_sold := now();
  end if;

  insert into public.pos_sales
    (id, ref, sold_at, seller, customer_name, customer_phone, customer_address, note,
     lines, subtotal, discount, total, rate, device)
  values
    (v_id,
     left(btrim(coalesce(p_sale ->> 'ref', '')), 20),
     v_sold,
     left(btrim(coalesce(p_sale ->> 'seller', '')), 60),
     v_name,
     v_phone,
     left(btrim(coalesce(p_sale ->> 'customerAddress', '')), 200),
     left(btrim(coalesce(p_sale ->> 'note', '')), 500),
     v_lines, v_subtotal, v_discount, v_subtotal - v_discount, v_rate,
     left(coalesce(p_sale ->> 'device', ''), 60))
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.pos_sales where id = v_id;
  end if;
  return public.pos_sale_json(v_row);
end;
$$;

-- ── Till: edit a sale ────────────────────────────────────────────────────────
-- What it was before goes into its history. A sale with returns is not edited.
create or replace function public.pos_update(p_id uuid, p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      public.pos_sales;
  v_lines    jsonb;
  v_subtotal numeric;
  v_discount numeric;
  v_name     text := left(btrim(coalesce(p_sale ->> 'customerName', '')), 120);
  v_phone    text := public.pos_phone(p_sale ->> 'customerPhone');
begin
  select * into v_row from public.pos_sales where id = p_id for update;
  if not found or v_row.deleted_at is not null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  if jsonb_array_length(v_row.returns) > 0 then
    raise exception 'SALE_HAS_RETURNS';
  end if;

  v_lines    := public.pos_clean_lines(p_sale -> 'lines');
  v_subtotal := public.pos_lines_sum(v_lines);
  v_discount := public.pos_lines_discount(v_lines);
  if v_name = '' or length(v_phone) < 7 then
    raise exception 'CUSTOMER_REQUIRED';
  end if;

  update public.pos_sales
     set seller           = left(btrim(coalesce(p_sale ->> 'seller', '')), 60),
         customer_name    = v_name,
         customer_phone   = v_phone,
         customer_address = left(btrim(coalesce(p_sale ->> 'customerAddress', '')), 200),
         note             = left(btrim(coalesce(p_sale ->> 'note', '')), 500),
         lines            = v_lines,
         subtotal         = v_subtotal,
         discount         = v_discount,
         total            = v_subtotal - v_discount,
         updated_at       = now(),
         history          = history || jsonb_build_array(jsonb_build_object(
           'at', now(), 'action', 'edit',
           'by', left(btrim(coalesce(p_sale ->> 'by', '')), 60),
           'note', '',
           'before', jsonb_build_object(
             'total', v_row.total,
             'discount', v_row.discount,
             'customerName', v_row.customer_name,
             'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                         'code', l ->> 'code', 'qty', (l ->> 'qty')::integer, 'price', (l ->> 'price')::numeric,
                         'discount', (l ->> 'discount')::numeric)), '[]'::jsonb)
                         from jsonb_array_elements(v_row.lines) as l))))
   where id = p_id
  returning * into v_row;
  return public.pos_sale_json(v_row);
end;
$$;

-- ── Till: return some or all of a sale ──────────────────────────────────────
create or replace function public.pos_return(p_id uuid, p_return jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.pos_sales;
  v_rid    text := left(btrim(coalesce(p_return ->> 'id', '')), 60);
  v_refund numeric;
  v_back   jsonb := '[]'::jsonb;
  v_item   jsonb;
  v_line   text;
  v_qty    integer;
  v_sold   integer;
  v_done   integer;
  v_at     timestamptz;
begin
  select * into v_row from public.pos_sales where id = p_id for update;
  if not found or v_row.deleted_at is not null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  if exists (select 1 from jsonb_array_elements(v_row.returns) as r where r ->> 'id' = v_rid) then
    return public.pos_sale_json(v_row);
  end if;
  if v_rid = '' or jsonb_typeof(p_return -> 'lines') is distinct from 'array' then
    raise exception 'RETURN_INVALID';
  end if;

  for v_item in select value from jsonb_array_elements(p_return -> 'lines') loop
    v_line := v_item ->> 'id';
    begin
      v_qty := (v_item ->> 'qty')::integer;
    exception when others then
      raise exception 'RETURN_INVALID';
    end;
    continue when coalesce(v_qty, 0) = 0;
    select (l ->> 'qty')::integer into v_sold
      from jsonb_array_elements(v_row.lines) as l where l ->> 'id' = v_line;
    select coalesce(sum((b ->> 'qty')::integer), 0) into v_done
      from jsonb_array_elements(v_row.returns) as r,
           jsonb_array_elements(r -> 'lines') as b
     where b ->> 'id' = v_line;
    if v_sold is null or v_qty < 0 or v_done + v_qty > v_sold
       or exists (select 1 from jsonb_array_elements(v_back) as b where b ->> 'id' = v_line) then
      raise exception 'RETURN_INVALID';
    end if;
    v_back := v_back || jsonb_build_array(jsonb_build_object('id', v_line, 'qty', v_qty));
  end loop;
  if jsonb_array_length(v_back) = 0 then
    raise exception 'RETURN_EMPTY';
  end if;

  begin
    v_refund := round(coalesce(nullif(p_return ->> 'refund', '')::numeric, 0));
    v_at     := coalesce(nullif(p_return ->> 'at', '')::timestamptz, now());
  exception when others then
    raise exception 'RETURN_INVALID';
  end;
  if v_refund < 0 or v_row.refunded + v_refund > v_row.total then
    raise exception 'RETURN_INVALID';
  end if;
  if v_at > now() + interval '10 minutes' or v_at < v_row.sold_at then
    v_at := now();
  end if;

  update public.pos_sales
     set returns    = returns || jsonb_build_array(jsonb_build_object(
                        'id', v_rid, 'at', v_at,
                        'reason', left(btrim(coalesce(p_return ->> 'reason', '')), 300),
                        'by', left(btrim(coalesce(p_return ->> 'by', '')), 60),
                        'refund', v_refund, 'lines', v_back)),
         refunded   = refunded + v_refund,
         updated_at = now(),
         history    = history || jsonb_build_array(jsonb_build_object(
                        'at', now(), 'action', 'return',
                        'by', left(btrim(coalesce(p_return ->> 'by', '')), 60),
                        'note', left(btrim(coalesce(p_return ->> 'reason', '')), 300)))
   where id = p_id
  returning * into v_row;
  return public.pos_sale_json(v_row);
end;
$$;

-- ── Till: undo a return saved by mistake ────────────────────────────────────
create or replace function public.pos_undo_return(p_id uuid, p_return_id text, p_by text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.pos_sales;
  v_refund numeric;
begin
  select * into v_row from public.pos_sales where id = p_id for update;
  if not found or v_row.deleted_at is not null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  select (r ->> 'refund')::numeric into v_refund
    from jsonb_array_elements(v_row.returns) as r where r ->> 'id' = p_return_id;
  if v_refund is null then
    return public.pos_sale_json(v_row);
  end if;

  update public.pos_sales
     set returns    = (select coalesce(jsonb_agg(r order by n), '[]'::jsonb)
                         from jsonb_array_elements(v_row.returns) with ordinality as t(r, n)
                        where r ->> 'id' <> p_return_id),
         refunded   = greatest(0, refunded - v_refund),
         updated_at = now(),
         history    = history || jsonb_build_array(jsonb_build_object(
                        'at', now(), 'action', 'undo_return',
                        'by', left(btrim(coalesce(p_by, '')), 60), 'note', ''))
   where id = p_id
  returning * into v_row;
  return public.pos_sale_json(v_row);
end;
$$;

-- ── Till: delete a sale (kept, marked deleted) ──────────────────────────────
create or replace function public.pos_delete(p_id uuid, p_reason text default '', p_by text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pos_sales;
begin
  update public.pos_sales
     set deleted_at    = coalesce(deleted_at, now()),
         delete_reason = left(btrim(coalesce(p_reason, '')), 300),
         updated_at    = now(),
         history       = history || jsonb_build_array(jsonb_build_object(
                           'at', now(), 'action', 'delete',
                           'by', left(btrim(coalesce(p_by, '')), 60),
                           'note', left(btrim(coalesce(p_reason, '')), 300)))
   where id = p_id and deleted_at is null
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.pos_sales where id = p_id;
    if v_row.id is null then
      raise exception 'SALE_NOT_FOUND';
    end if;
  end if;
  return public.pos_sale_json(v_row);
end;
$$;

-- ── Till: past sales, newest first ──────────────────────────────────────────
-- Found by invoice number, T- reference, customer, phone or model.
create or replace function public.pos_list(
  p_from  timestamptz default null,
  p_to    timestamptz default null,
  p_query text default '',
  p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q      text := lower(btrim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
begin
  return coalesce((
    select jsonb_agg(public.pos_sale_json(s) order by s.sold_at desc, s.sale_no desc)
      from (
        select *
          from public.pos_sales as p
         where p.deleted_at is null
           and (p_from is null or p.sold_at >= p_from)
           and (p_to is null or p.sold_at < p_to)
           and (v_q = ''
                or p.sale_no::text = v_q
                or position(v_q in lower(p.ref)) > 0
                or position(v_q in lower(p.customer_name)) > 0
                or position(v_q in lower(p.seller)) > 0
                or (length(v_digits) >= 4 and position(v_digits in p.customer_phone) > 0)
                or exists (select 1 from jsonb_array_elements(p.lines) as l
                            where position(v_q in lower(l ->> 'code')) > 0
                               or position(v_q in lower(l ->> 'name')) > 0))
         order by p.sold_at desc
         limit least(greatest(coalesce(p_limit, 300), 1), 1000)
      ) as s), '[]'::jsonb);
end;
$$;

-- ── Till: the dollar rate, one for every till ───────────────────────────────
create or replace function public.pos_set_rate(p_rate numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_rate is null or p_rate not between 100 and 100000 then
    raise exception 'RATE_INVALID';
  end if;
  insert into public.pos_settings (id, data, updated_at)
  values (1, jsonb_build_object('rate', p_rate, 'rateAt', now()), now())
  on conflict (id) do update
    set data = public.pos_settings.data || excluded.data, updated_at = now();
  return p_rate;
end;
$$;

-- ── Owner report: every sale, deleted ones too ──────────────────────────────
create or replace function public.pos_report(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) in ('', 'feedback@gmail.com') then
    raise exception 'NOT_ALLOWED';
  end if;
  return coalesce((
    select jsonb_agg(public.pos_sale_json(s) order by s.sold_at desc, s.sale_no desc)
      from public.pos_sales as s
     where ((p_from is null or s.sold_at >= p_from) and (p_to is null or s.sold_at < p_to))
        or exists (select 1 from jsonb_array_elements(s.returns) as r
                    where (p_from is null or (r ->> 'at')::timestamptz >= p_from)
                      and (p_to is null or (r ->> 'at')::timestamptz < p_to))), '[]'::jsonb);
end;
$$;

create or replace function public.pos_restore(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pos_sales;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) in ('', 'feedback@gmail.com') then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.pos_sales
     set deleted_at = null, delete_reason = '', updated_at = now(),
         history = history || jsonb_build_array(jsonb_build_object(
           'at', now(), 'action', 'restore', 'by', auth.jwt() ->> 'email', 'note', ''))
   where id = p_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  return public.pos_sale_json(v_row);
end;
$$;

-- ── What the till (anon key) may call, and what only the owner's side may ───
revoke all on function public.pos_save(jsonb)                                          from public;
revoke all on function public.pos_update(uuid, jsonb)                                  from public;
revoke all on function public.pos_return(uuid, jsonb)                                  from public;
revoke all on function public.pos_undo_return(uuid, text, text)                        from public;
revoke all on function public.pos_delete(uuid, text, text)                             from public;
revoke all on function public.pos_list(timestamptz, timestamptz, text, integer)        from public;
revoke all on function public.pos_set_rate(numeric)                                    from public;
revoke all on function public.pos_report(timestamptz, timestamptz)                     from public, anon;
revoke all on function public.pos_restore(uuid)                                        from public, anon;

grant execute on function public.pos_save(jsonb)                                       to anon, authenticated;
grant execute on function public.pos_update(uuid, jsonb)                               to anon, authenticated;
grant execute on function public.pos_return(uuid, jsonb)                               to anon, authenticated;
grant execute on function public.pos_undo_return(uuid, text, text)                     to anon, authenticated;
grant execute on function public.pos_delete(uuid, text, text)                          to anon, authenticated;
grant execute on function public.pos_list(timestamptz, timestamptz, text, integer)     to anon, authenticated;
grant execute on function public.pos_set_rate(numeric)                                 to anon, authenticated;
grant execute on function public.pos_report(timestamptz, timestamptz)                  to authenticated;
grant execute on function public.pos_restore(uuid)                                     to authenticated;

notify pgrst, 'reload schema';

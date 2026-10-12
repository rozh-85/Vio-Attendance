-- Social media orders
--
-- Social media sellers sign in at /orders with an account the owner makes in
-- /rozhadmin/orders. A seller adds orders, and sees only their OWN orders of
-- the last 24 hours, to fix or delete one while it is still new. They never
-- see anyone else's orders, or their own older ones. All orders are read only
-- by signed-in supervisors and are shown only in the owner report.
--
-- Run once in the Supabase SQL editor, after schema.sql. Safe to run again —
-- run the whole file again after it changes.

create extension if not exists pgcrypto with schema extensions;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.social_accounts (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid references public.employees(id) on delete set null,
  display_name    text not null check (btrim(display_name) <> ''),
  username        text not null,
  password_hash   text not null,
  active          boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

create unique index if not exists social_accounts_username_idx
  on public.social_accounts (lower(username));

-- A seller's phone keeps a random token; only its SHA-256 is stored here.
create table if not exists public.social_account_sessions (
  token_hash text primary key,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.social_orders (
  id             uuid primary key default gen_random_uuid(),
  order_no       bigint generated always as identity,
  account_id     uuid references public.social_accounts(id) on delete set null,
  -- Kept as written when the order was saved, so a renamed or deleted
  -- account never changes who sold an old order.
  seller_name    text not null default '',
  created_at     timestamptz not null default now(),
  customer_name  text not null default '',
  customer_phone text not null default '',
  second_phone   text not null default '',
  city           text not null default '',
  address        text not null default '',
  item_model     text not null default '',
  item_category  text not null default '',
  total_price    numeric(14, 0) not null default 0 check (total_price >= 0),
  gender         text not null default '' check (gender in ('', 'female', 'male')),
  platform       text not null default '',
  purchase       text not null default '' check (purchase in ('', 'first', 'second', 'repeat')),
  shift          text not null default '' check (shift in ('', 'morning', 'afternoon', 'night')),
  note           text not null default '',
  status         text not null default 'new'
                 check (status in ('new', 'delivered', 'cancelled', 'returned')),
  source         text not null default 'app' check (source in ('app', 'import')),
  -- Set on rows imported from the old Google Sheet, so importing the same
  -- file twice adds nothing the second time.
  import_key     text unique,
  -- Set when the seller changed the order after saving it.
  edited_at      timestamptz
);

-- Databases set up before sellers could fix their orders.
alter table public.social_orders add column if not exists edited_at timestamptz;

create index if not exists social_orders_created_idx
  on public.social_orders (created_at desc);
create index if not exists social_orders_account_idx
  on public.social_orders (account_id);

-- ── Who may read and change what ────────────────────────────────────────────
-- Supervisors (any signed-in account except the feedback-only one) manage
-- accounts and orders. Sellers use the anon key and reach nothing directly:
-- they go through the functions below.
alter table public.social_accounts         enable row level security;
alter table public.social_account_sessions enable row level security;
alter table public.social_orders           enable row level security;

drop policy if exists social_accounts_supervisor on public.social_accounts;
create policy social_accounts_supervisor
  on public.social_accounts for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');

drop policy if exists social_orders_supervisor on public.social_orders;
create policy social_orders_supervisor
  on public.social_orders for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');

revoke all on public.social_accounts         from anon, authenticated;
revoke all on public.social_account_sessions from anon, authenticated;
revoke all on public.social_orders           from anon, authenticated;

-- The password hash and lock counters stay out of reach even for supervisors.
grant select (id, employee_id, display_name, username, active, created_at, last_login_at)
  on public.social_accounts to authenticated;
grant update (employee_id, display_name, active) on public.social_accounts to authenticated;
grant delete on public.social_accounts to authenticated;
grant select, insert, update, delete on public.social_orders to authenticated;

-- ── Internal: the active account behind a seller's token ────────────────────
create or replace function public.social_session_account(p_token text)
returns public.social_accounts
language sql
stable
security definer
set search_path = ''
as $$
  select account.*
    from public.social_account_sessions as session
    join public.social_accounts as account on account.id = session.account_id
   where session.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and session.expires_at > now()
     and account.active;
$$;

-- Returns the whole account row, hash included: never callable from outside.
revoke all on function public.social_session_account(text) from public, anon, authenticated;

-- ── Seller: sign in ──────────────────────────────────────────────────────────
-- Answers with {error} instead of raising, so the failed-attempt count is kept:
-- five wrong passwords lock the account for 15 minutes.
create or replace function public.social_sign_in(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.social_accounts;
  v_token   text;
  v_expires timestamptz := now() + interval '30 days';
begin
  select * into v_account
    from public.social_accounts
   where lower(username) = lower(btrim(coalesce(p_username, '')))
   for update;

  if not found or not v_account.active then
    return jsonb_build_object('error', 'WRONG_LOGIN');
  end if;
  if v_account.locked_until is not null and v_account.locked_until > now() then
    return jsonb_build_object('error', 'ACCOUNT_LOCKED');
  end if;

  if v_account.password_hash <> extensions.crypt(coalesce(p_password, ''), v_account.password_hash) then
    update public.social_accounts
       set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
           locked_until    = case when failed_attempts + 1 >= 5
                                  then now() + interval '15 minutes' else locked_until end
     where id = v_account.id;
    return jsonb_build_object('error', 'WRONG_LOGIN');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.social_account_sessions (token_hash, account_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_account.id, v_expires);

  update public.social_accounts
     set failed_attempts = 0, locked_until = null, last_login_at = now()
   where id = v_account.id;

  delete from public.social_account_sessions where expires_at < now();

  return jsonb_build_object(
    'token', v_token,
    'displayName', v_account.display_name,
    'expiresAt', v_expires);
end;
$$;

-- ── Seller: is this phone still signed in? ──────────────────────────────────
create or replace function public.social_whoami(p_token text)
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
    return null;
  end if;
  return jsonb_build_object('displayName', v_account.display_name);
end;
$$;

-- ── Seller: sign out ─────────────────────────────────────────────────────────
create or replace function public.social_sign_out(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.social_account_sessions
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- ── Internal: a seller's order form, checked and trimmed ────────────────────
create or replace function public.social_clean_order(p_order jsonb)
returns public.social_orders
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_row   public.social_orders;
  v_price numeric;
begin
  v_price := case
    when coalesce(p_order ->> 'totalPrice', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then round((p_order ->> 'totalPrice')::numeric)
  end;

  if nullif(btrim(p_order ->> 'customerName'), '') is null
     or nullif(btrim(p_order ->> 'customerPhone'), '') is null
     or nullif(btrim(p_order ->> 'city'), '') is null
     or nullif(btrim(p_order ->> 'platform'), '') is null
     or v_price is null or v_price <= 0 then
    raise exception 'ORDER_INCOMPLETE';
  end if;

  v_row.customer_name  := left(btrim(p_order ->> 'customerName'), 200);
  v_row.customer_phone := left(btrim(p_order ->> 'customerPhone'), 40);
  v_row.second_phone   := left(btrim(coalesce(p_order ->> 'secondPhone', '')), 40);
  v_row.city           := left(btrim(p_order ->> 'city'), 100);
  v_row.address        := left(btrim(coalesce(p_order ->> 'address', '')), 500);
  v_row.item_model     := left(btrim(coalesce(p_order ->> 'itemModel', '')), 100);
  v_row.item_category  := left(btrim(coalesce(p_order ->> 'itemCategory', '')), 200);
  v_row.total_price    := v_price;
  v_row.gender         := case when p_order ->> 'gender' in ('female', 'male')
                               then p_order ->> 'gender' else '' end;
  v_row.platform       := left(btrim(p_order ->> 'platform'), 50);
  v_row.purchase       := case when p_order ->> 'purchase' in ('first', 'second', 'repeat')
                               then p_order ->> 'purchase' else '' end;
  v_row.shift          := case when p_order ->> 'shift' in ('morning', 'afternoon', 'night')
                               then p_order ->> 'shift' else '' end;
  v_row.note           := left(btrim(coalesce(p_order ->> 'note', '')), 1000);
  return v_row;
end;
$$;

revoke all on function public.social_clean_order(jsonb) from public, anon, authenticated;

-- ── Seller: add an order ─────────────────────────────────────────────────────
-- Returns only the new order's number.
create or replace function public.submit_social_order(p_token text, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.social_accounts;
  v_clean   public.social_orders;
  v_row     public.social_orders;
begin
  v_account := public.social_session_account(p_token);
  if v_account.id is null then
    raise exception 'SESSION_EXPIRED';
  end if;
  v_clean := public.social_clean_order(p_order);

  insert into public.social_orders (
    account_id, seller_name, customer_name, customer_phone, second_phone,
    city, address, item_model, item_category, total_price, gender, platform,
    purchase, shift, note)
  values (
    v_account.id, v_account.display_name, v_clean.customer_name,
    v_clean.customer_phone, v_clean.second_phone, v_clean.city, v_clean.address,
    v_clean.item_model, v_clean.item_category, v_clean.total_price,
    v_clean.gender, v_clean.platform, v_clean.purchase, v_clean.shift, v_clean.note)
  returning * into v_row;

  return jsonb_build_object('orderNo', v_row.order_no, 'createdAt', v_row.created_at);
end;
$$;

-- ── Seller: their own orders of the last 24 hours ───────────────────────────
-- An order can be fixed or deleted by its seller for 24 hours, and only while
-- it is still new — once the owner marks it delivered, cancelled or returned
-- it is the owner's to change.
create or replace function public.social_my_orders(p_token text)
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
             'id', o.id,
             'orderNo', o.order_no,
             'createdAt', o.created_at,
             'editedAt', o.edited_at,
             'customerName', o.customer_name,
             'customerPhone', o.customer_phone,
             'secondPhone', o.second_phone,
             'city', o.city,
             'address', o.address,
             'itemModel', o.item_model,
             'itemCategory', o.item_category,
             'totalPrice', o.total_price,
             'gender', o.gender,
             'platform', o.platform,
             'purchase', o.purchase,
             'shift', o.shift,
             'note', o.note,
             'status', o.status,
             'canChange', o.status = 'new')
           order by o.created_at desc)
      from public.social_orders as o
     where o.account_id = v_account.id
       and o.source = 'app'
       and o.created_at > now() - interval '24 hours'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.update_my_social_order(p_token text, p_order_id uuid, p_order jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.social_accounts;
  v_clean   public.social_orders;
begin
  v_account := public.social_session_account(p_token);
  if v_account.id is null then
    raise exception 'SESSION_EXPIRED';
  end if;
  v_clean := public.social_clean_order(p_order);

  update public.social_orders
     set customer_name  = v_clean.customer_name,
         customer_phone = v_clean.customer_phone,
         second_phone   = v_clean.second_phone,
         city           = v_clean.city,
         address        = v_clean.address,
         item_model     = v_clean.item_model,
         item_category  = v_clean.item_category,
         total_price    = v_clean.total_price,
         gender         = v_clean.gender,
         platform       = v_clean.platform,
         purchase       = v_clean.purchase,
         shift          = v_clean.shift,
         note           = v_clean.note,
         edited_at      = now()
   where id = p_order_id
     and account_id = v_account.id
     and source = 'app'
     and status = 'new'
     and created_at > now() - interval '24 hours';
  if not found then
    raise exception 'ORDER_LOCKED';
  end if;
end;
$$;

create or replace function public.delete_my_social_order(p_token text, p_order_id uuid)
returns void
language plpgsql
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

  delete from public.social_orders
   where id = p_order_id
     and account_id = v_account.id
     and source = 'app'
     and status = 'new'
     and created_at > now() - interval '24 hours';
  if not found then
    raise exception 'ORDER_LOCKED';
  end if;
end;
$$;

-- ── Owner: make an account / set its password ───────────────────────────────
create or replace function public.create_social_account(
  p_display_name text,
  p_username     text,
  p_password     text,
  p_employee_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null
     or lower(coalesce(auth.jwt() ->> 'email', '')) = 'feedback@gmail.com' then
    raise exception 'NOT_ALLOWED';
  end if;
  if nullif(btrim(p_display_name), '') is null
     or btrim(coalesce(p_username, '')) !~ '^[A-Za-z0-9._-]{3,32}$' then
    raise exception 'ACCOUNT_INVALID';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;
  if exists (
    select 1 from public.social_accounts
     where lower(username) = lower(btrim(p_username))
  ) then
    raise exception 'USERNAME_TAKEN';
  end if;

  insert into public.social_accounts (employee_id, display_name, username, password_hash)
  values (
    p_employee_id,
    btrim(p_display_name),
    btrim(p_username),
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  returning id into v_id;
  return v_id;
end;
$$;

-- A new password also signs the account out on every phone.
create or replace function public.set_social_account_password(p_account_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or lower(coalesce(auth.jwt() ->> 'email', '')) = 'feedback@gmail.com' then
    raise exception 'NOT_ALLOWED';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;

  update public.social_accounts
     set password_hash   = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         failed_attempts = 0,
         locked_until    = null
   where id = p_account_id;
  delete from public.social_account_sessions where account_id = p_account_id;
end;
$$;

-- ── Who may call which function ─────────────────────────────────────────────
revoke all on function public.social_sign_in(text, text)               from public;
revoke all on function public.social_whoami(text)                      from public;
revoke all on function public.social_sign_out(text)                    from public;
revoke all on function public.submit_social_order(text, jsonb)         from public;
revoke all on function public.social_my_orders(text)                   from public;
revoke all on function public.update_my_social_order(text, uuid, jsonb) from public;
revoke all on function public.delete_my_social_order(text, uuid)       from public;
revoke all on function public.create_social_account(text, text, text, uuid) from public, anon;
revoke all on function public.set_social_account_password(uuid, text) from public, anon;

grant execute on function public.social_sign_in(text, text)       to anon, authenticated;
grant execute on function public.social_whoami(text)              to anon, authenticated;
grant execute on function public.social_sign_out(text)            to anon, authenticated;
grant execute on function public.submit_social_order(text, jsonb) to anon, authenticated;
grant execute on function public.social_my_orders(text)           to anon, authenticated;
grant execute on function public.update_my_social_order(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.delete_my_social_order(text, uuid)       to anon, authenticated;
grant execute on function public.create_social_account(text, text, text, uuid) to authenticated;
grant execute on function public.set_social_account_password(uuid, text)       to authenticated;

notify pgrst, 'reload schema';

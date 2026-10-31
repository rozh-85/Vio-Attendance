-- Run after social-orders.sql. Safe to re-run; no existing order data changes.
begin;
-- Stable account IDs, not a browser-supplied name, control this feature.
create table if not exists public.gashben_place_accounts (
  account_id uuid primary key references public.social_accounts(id) on delete cascade
);
insert into public.gashben_place_accounts(account_id)
select id from public.social_accounts
where lower(btrim(username)) in ('gashben','gashbin','gashbeen','گەشبین')
   or lower(btrim(display_name)) in ('gashben','gashbin','gashbeen','گەشبین')
on conflict do nothing;
-- If Gashben uses a different username, insert that account's ID here in the
-- SQL editor: insert into public.gashben_place_accounts values ('ACCOUNT-UUID');

create table if not exists public.gashben_places (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id),
  person_name text not null check (length(btrim(person_name)) between 1 and 200),
  name text not null check (length(btrim(name)) between 1 and 200),
  phone text not null check (length(btrim(phone)) between 1 and 50),
  city text not null check (length(btrim(city)) between 1 and 200),
  kind text not null check (length(btrim(kind)) between 1 and 100),
  reminder_date date,
  last_activity timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.gashben_place_calls (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.gashben_places(id) on delete cascade,
  called_at timestamptz not null default now(),
  note text not null default '' check (length(note) <= 2000)
);
create table if not exists public.gashben_place_orders (
  order_id uuid primary key references public.social_orders(id) on delete cascade,
  place_id uuid not null references public.gashben_places(id) on delete cascade
);
create index if not exists gashben_places_account on public.gashben_places(account_id);
create index if not exists gashben_calls_place on public.gashben_place_calls(place_id);
create index if not exists gashben_orders_place on public.gashben_place_orders(place_id);
alter table public.gashben_place_accounts enable row level security;
alter table public.gashben_places enable row level security;
alter table public.gashben_place_calls enable row level security;
alter table public.gashben_place_orders enable row level security;
revoke all on public.gashben_place_accounts, public.gashben_places,
  public.gashben_place_calls, public.gashben_place_orders from public, anon, authenticated;
-- No direct table grants: sellers use their token; the owner report uses the
-- same authenticated supervisor boundary as the existing orders report.
create or replace function public.gashben_places_account(p_token text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare a public.social_accounts;
begin
  a := public.social_session_account(p_token);
  if a.id is null then raise exception 'SESSION_EXPIRED'; end if;
  if not exists(select 1 from public.gashben_place_accounts where account_id = a.id)
    then raise exception 'This page is only available to Gashben.'; end if;
  return a.id;
end $$;
revoke all on function public.gashben_places_account(text) from public, anon, authenticated;

create or replace function public.gashben_places_access(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.gashben_place_accounts p
    where p.account_id = (public.social_session_account(p_token)).id);
$$;

create or replace function public.gashben_places_data(p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a uuid;
begin
  if p_token is not null then a := public.gashben_places_account(p_token);
  elsif auth.uid() is null or lower(coalesce(auth.jwt()->>'email','')) = 'feedback@gmail.com'
    then raise exception 'NOT_ALLOWED';
  end if;
  return jsonb_build_object(
    'places', coalesce((select jsonb_agg(p order by p.created_at desc) from public.gashben_places p where a is null or p.account_id=a),'[]'::jsonb),
    'calls', coalesce((select jsonb_agg(c order by c.called_at desc) from public.gashben_place_calls c join public.gashben_places p on p.id=c.place_id where a is null or p.account_id=a),'[]'::jsonb),
    'links', coalesce((select jsonb_agg(l) from public.gashben_place_orders l join public.gashben_places p on p.id=l.place_id where a is null or p.account_id=a),'[]'::jsonb));
end $$;

create or replace function public.gashben_save_place(p_token text, p_id uuid, p_place jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid := public.gashben_places_account(p_token); result uuid;
begin
  if p_id is null then
    insert into public.gashben_places(account_id,person_name,name,phone,city,kind,reminder_date)
    values(a,btrim(p_place->>'person_name'),btrim(p_place->>'name'),btrim(p_place->>'phone'),btrim(p_place->>'city'),btrim(p_place->>'kind'),nullif(p_place->>'reminder_date','')::date)
    returning id into result;
  else
    update public.gashben_places set person_name=btrim(p_place->>'person_name'), name=btrim(p_place->>'name'),
      phone=btrim(p_place->>'phone'), city=btrim(p_place->>'city'), kind=btrim(p_place->>'kind'),
      reminder_date=nullif(p_place->>'reminder_date','')::date
    where id=p_id and account_id=a returning id into result;
    if result is null then raise exception 'Place not found.'; end if;
  end if;
  return result;
end $$;

create or replace function public.gashben_log_call(p_token text,p_id uuid,p_note text,p_next_date date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a uuid := public.gashben_places_account(p_token);
begin
  update public.gashben_places set last_activity=now(), reminder_date=p_next_date
    where id=p_id and account_id=a;
  if not found then raise exception 'Place not found.'; end if;
  insert into public.gashben_place_calls(place_id,note) values(p_id,coalesce(p_note,''));
end $$;

-- Both the existing order and the place link are saved in one transaction.
-- Uses the exact same validation and fields as the current order sheet.
create or replace function public.gashben_submit_place_order(p_token text,p_id uuid,p_order jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a uuid := public.gashben_places_account(p_token); result jsonb; oid uuid;
begin
  perform 1 from public.gashben_places where id=p_id and account_id=a for update;
  if not found then raise exception 'Place not found.'; end if;
  result := public.submit_social_order(p_token,p_order);
  select id into oid from public.social_orders where order_no=(result->>'orderNo')::bigint and account_id=a;
  insert into public.gashben_place_orders(place_id,order_id) values(p_id,oid);
  update public.gashben_places set last_activity=now() where id=p_id;
  return result;
end $$;

revoke all on function public.gashben_places_access(text), public.gashben_places_data(text),
  public.gashben_save_place(text,uuid,jsonb),public.gashben_log_call(text,uuid,text,date),
  public.gashben_submit_place_order(text,uuid,jsonb) from public;
grant execute on function public.gashben_places_access(text), public.gashben_places_data(text),
  public.gashben_save_place(text,uuid,jsonb),public.gashben_log_call(text,uuid,text,date),
  public.gashben_submit_place_order(text,uuid,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;

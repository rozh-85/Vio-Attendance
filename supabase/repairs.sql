-- Repairs (عەتڵ)
--
-- The repair desk signs in at /repair (or at /VioAdmin with the same email)
-- with its own account, separate from the supervisors. It records each faulty
-- item a customer brings in: name, phone, item type, the day it came in, the
-- day it was repaired and a note. A customer is found again by phone number,
-- and every visit stays on their profile.
--
-- The account reaches nothing directly: everything goes through the
-- functions below, with a token its browser keeps. Signed-in supervisors may
-- read the repairs too.
--
-- Run once in the Supabase SQL editor. Safe to run again — run the whole file
-- again after it changes.

create extension if not exists pgcrypto with schema extensions;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.repair_accounts (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  display_name    text not null check (btrim(display_name) <> ''),
  password_hash   text not null,
  active          boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

create unique index if not exists repair_accounts_email_idx
  on public.repair_accounts (lower(email));

-- The browser keeps a random token; only its SHA-256 is stored here.
create table if not exists public.repair_sessions (
  token_hash text primary key,
  account_id uuid not null references public.repair_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.repair_tickets (
  id            uuid primary key default gen_random_uuid(),
  ticket_no     bigint generated always as identity,
  customer_name text not null default '',
  -- Digits only, 07XXXXXXXXX for Iraqi mobiles, so a search always matches.
  phone         text not null default '',
  item_type     text not null default '',
  brought_on    date not null default current_date,
  repaired_on   date,
  note          text not null default '',
  -- Set when the item was repaired and handed back to the customer.
  delivered_at  timestamptz,
  account_id    uuid references public.repair_accounts(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists repair_tickets_phone_idx on public.repair_tickets (phone);
create index if not exists repair_tickets_brought_idx on public.repair_tickets (brought_on desc);

-- ── Who may read and change what ────────────────────────────────────────────
alter table public.repair_accounts enable row level security;
alter table public.repair_sessions enable row level security;
alter table public.repair_tickets  enable row level security;

revoke all on public.repair_accounts from anon, authenticated;
revoke all on public.repair_sessions from anon, authenticated;
revoke all on public.repair_tickets  from anon, authenticated;

-- Supervisors (any signed-in account except the feedback-only one) may read.
drop policy if exists repair_tickets_supervisor_read on public.repair_tickets;
create policy repair_tickets_supervisor_read
  on public.repair_tickets for select to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) <> 'feedback@gmail.com');
grant select on public.repair_tickets to authenticated;

-- ── The repair account ───────────────────────────────────────────────────────
-- shalaw@vio.com. Only the bcrypt hash of the password is kept here.
-- To give it a new password later:
--   update public.repair_accounts
--      set password_hash = extensions.crypt('NEW PASSWORD', extensions.gen_salt('bf'))
--    where lower(email) = 'shalaw@vio.com';
insert into public.repair_accounts (email, display_name, password_hash)
select 'shalaw@vio.com', 'Shalaw', '$2a$10$9BvaYdLPP34KvNKWIF1PG.5Nnp2302vQs5gEjQ.NI9u7AzonG4WFm'
 where not exists (
   select 1 from public.repair_accounts where lower(email) = 'shalaw@vio.com'
 );

-- ── Internal: helpers ────────────────────────────────────────────────────────
create or replace function public.repair_session_account(p_token text)
returns public.repair_accounts
language sql
stable
security definer
set search_path = ''
as $$
  select account.*
    from public.repair_sessions as session
    join public.repair_accounts as account on account.id = session.account_id
   where session.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and session.expires_at > now()
     and account.active;
$$;

-- Returns the whole account row, hash included: never callable from outside.
revoke all on function public.repair_session_account(text) from public, anon, authenticated;

-- One ticket as the app reads it.
create or replace function public.repair_ticket_json(t public.repair_tickets)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'ticketNo', t.ticket_no,
    'customerName', t.customer_name,
    'phone', t.phone,
    'itemType', t.item_type,
    'broughtOn', t.brought_on,
    'repairedOn', t.repaired_on,
    'note', t.note,
    'deliveredAt', t.delivered_at,
    'createdAt', t.created_at,
    'updatedAt', t.updated_at);
$$;

revoke all on function public.repair_ticket_json(public.repair_tickets) from public, anon, authenticated;

-- ── Sign in / who am I / sign out ────────────────────────────────────────────
-- Answers with {error} instead of raising, so the failed-attempt count is kept:
-- five wrong passwords lock the account for 15 minutes.
create or replace function public.repair_sign_in(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.repair_accounts;
  v_token   text;
  v_expires timestamptz := now() + interval '30 days';
begin
  select * into v_account
    from public.repair_accounts
   where lower(email) = lower(btrim(coalesce(p_email, '')))
   for update;

  if not found or not v_account.active then
    return jsonb_build_object('error', 'WRONG_LOGIN');
  end if;
  if v_account.locked_until is not null and v_account.locked_until > now() then
    return jsonb_build_object('error', 'ACCOUNT_LOCKED');
  end if;

  if v_account.password_hash <> extensions.crypt(coalesce(p_password, ''), v_account.password_hash) then
    update public.repair_accounts
       set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
           locked_until    = case when failed_attempts + 1 >= 5
                                  then now() + interval '15 minutes' else locked_until end
     where id = v_account.id;
    return jsonb_build_object('error', 'WRONG_LOGIN');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.repair_sessions (token_hash, account_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_account.id, v_expires);

  update public.repair_accounts
     set failed_attempts = 0, locked_until = null, last_login_at = now()
   where id = v_account.id;

  delete from public.repair_sessions where expires_at < now();

  return jsonb_build_object('token', v_token, 'displayName', v_account.display_name);
end;
$$;

create or replace function public.repair_whoami(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account public.repair_accounts;
begin
  v_account := public.repair_session_account(p_token);
  if v_account.id is null then
    return null;
  end if;
  return jsonb_build_object('displayName', v_account.display_name);
end;
$$;

create or replace function public.repair_sign_out(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.repair_sessions
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- ── Every repair, newest first ───────────────────────────────────────────────
create or replace function public.repair_list(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (public.repair_session_account(p_token)).id is null then
    raise exception 'SESSION_EXPIRED';
  end if;
  return coalesce(
    (select jsonb_agg(public.repair_ticket_json(t) order by t.brought_on desc, t.ticket_no desc)
       from public.repair_tickets as t),
    '[]'::jsonb);
end;
$$;

-- ── Add a repair, or change one (when p_ticket has an id) ────────────────────
create or replace function public.repair_save(p_token text, p_ticket jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account  public.repair_accounts;
  v_id       uuid;
  v_name     text := left(btrim(coalesce(p_ticket ->> 'customerName', '')), 200);
  v_phone    text := left(regexp_replace(coalesce(p_ticket ->> 'phone', ''), '[^0-9]', '', 'g'), 20);
  v_item     text := left(btrim(coalesce(p_ticket ->> 'itemType', '')), 120);
  v_note     text := left(btrim(coalesce(p_ticket ->> 'note', '')), 1000);
  v_brought  date;
  v_repaired date;
  v_row      public.repair_tickets;
begin
  v_account := public.repair_session_account(p_token);
  if v_account.id is null then
    raise exception 'SESSION_EXPIRED';
  end if;

  begin
    v_brought  := coalesce(nullif(p_ticket ->> 'broughtOn', '')::date, current_date);
    v_repaired := nullif(p_ticket ->> 'repairedOn', '')::date;
  exception when others then
    raise exception 'TICKET_INVALID';
  end;

  if v_name = '' or length(v_phone) < 7 or v_item = '' then
    raise exception 'TICKET_INCOMPLETE';
  end if;
  if v_repaired is not null and v_repaired < v_brought then
    raise exception 'TICKET_INVALID';
  end if;

  v_id := nullif(p_ticket ->> 'id', '')::uuid;
  if v_id is null then
    insert into public.repair_tickets
      (customer_name, phone, item_type, brought_on, repaired_on, note, account_id)
    values (v_name, v_phone, v_item, v_brought, v_repaired, v_note, v_account.id)
    returning * into v_row;
  else
    update public.repair_tickets
       set customer_name = v_name,
           phone         = v_phone,
           item_type     = v_item,
           brought_on    = v_brought,
           repaired_on   = v_repaired,
           note          = v_note,
           updated_at    = now()
     where id = v_id
    returning * into v_row;
    if v_row.id is null then
      raise exception 'TICKET_NOT_FOUND';
    end if;
  end if;

  return public.repair_ticket_json(v_row);
end;
$$;

-- ── Repaired and handed back to the customer (or undo it) ────────────────────
create or replace function public.repair_set_delivered(p_token text, p_id uuid, p_delivered boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.repair_tickets;
begin
  if (public.repair_session_account(p_token)).id is null then
    raise exception 'SESSION_EXPIRED';
  end if;

  update public.repair_tickets
     set delivered_at = case when p_delivered then now() end,
         repaired_on  = case when p_delivered
                             then coalesce(repaired_on, greatest(current_date, brought_on))
                             else repaired_on end,
         updated_at   = now()
   where id = p_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'TICKET_NOT_FOUND';
  end if;
  return public.repair_ticket_json(v_row);
end;
$$;

-- ── Delete a repair saved by mistake ─────────────────────────────────────────
create or replace function public.repair_delete(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (public.repair_session_account(p_token)).id is null then
    raise exception 'SESSION_EXPIRED';
  end if;
  delete from public.repair_tickets where id = p_id;
end;
$$;

-- The browser (anon key) may call only these.
revoke all on function public.repair_sign_in(text, text)                 from public;
revoke all on function public.repair_whoami(text)                        from public;
revoke all on function public.repair_sign_out(text)                      from public;
revoke all on function public.repair_list(text)                          from public;
revoke all on function public.repair_save(text, jsonb)                   from public;
revoke all on function public.repair_set_delivered(text, uuid, boolean)  from public;
revoke all on function public.repair_delete(text, uuid)                  from public;

grant execute on function public.repair_sign_in(text, text)                to anon, authenticated;
grant execute on function public.repair_whoami(text)                       to anon, authenticated;
grant execute on function public.repair_sign_out(text)                     to anon, authenticated;
grant execute on function public.repair_list(text)                         to anon, authenticated;
grant execute on function public.repair_save(text, jsonb)                  to anon, authenticated;
grant execute on function public.repair_set_delivered(text, uuid, boolean) to anon, authenticated;
grant execute on function public.repair_delete(text, uuid)                 to anon, authenticated;

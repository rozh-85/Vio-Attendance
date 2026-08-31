-- ═════════════════════════════════════════════════════════════════════════════
-- Vio Attendance — complete database schema
--
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query
-- → paste → Run). It is the whole backend: tables, the code sequence, the
-- employee-facing functions, row-level security and grants.
--
-- Safe to re-run: every statement is idempotent and none of them delete data.
--
-- After running it:
--   1. Authentication → Users → Add user → create the supervisor login
--      (email + password, "Auto Confirm User" ticked).
--   2. Open the app at /VioAdmin and sign in with that account.
--
-- The app reads this database with the public anon key, which ships inside the
-- browser bundle. That key can therefore do only four things, all of them
-- through the security-definer functions below: look a code up by phone, check
-- in, check out, and read the session list. It can never read or edit the
-- employee roster — that needs a signed-in supervisor.
-- ═════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Employees ────────────────────────────────────────────────────────────────
-- One row per person. Identified by their unique phone number; the short
-- `code` (001, 002, …) is what they type on the check-in screen.
create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  full_name   text not null,
  phone       text not null unique,
  "position"  text not null default '',
  created_at  timestamptz not null default now()
);

-- Sequential 3-digit-style codes (001, 002, ...).
create sequence if not exists public.employee_code_seq start 1;

create or replace function public.next_employee_code()
returns integer
language sql
security definer
set search_path = public
as $$
  select nextval('public.employee_code_seq')::integer;
$$;

-- Re-running this file must never hand out a code that is already taken.
do $$
declare
  max_code integer;
begin
  select coalesce(max(code::integer), 0)
    into max_code
    from public.employees
   where code ~ '^[0-9]+$';

  perform setval('public.employee_code_seq', greatest(max_code, 1), max_code > 0);
end $$;

-- ── Sessions ─────────────────────────────────────────────────────────────────
-- One row per work session. `check_in_open` / `check_out_open` are the gates
-- the supervisor toggles from the session screen.
create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  supervisor_name text not null,
  title           text not null default '',
  location        text not null default '',
  status          text not null default 'active' check (status in ('active','closed')),
  check_in_open   boolean not null default false,
  check_out_open  boolean not null default false,
  started_at      timestamptz not null default now(),
  closed_at       timestamptz,
  constraint sessions_closed_after_start check (closed_at is null or closed_at >= started_at)
);

-- ── Attendance ───────────────────────────────────────────────────────────────
-- One row per employee per session, rewritten when they re-enter.
create table if not exists public.attendance (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id)  on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  check_in_at  timestamptz,
  check_out_at timestamptz,
  constraint attendance_session_employee_unique unique (session_id, employee_id),
  constraint attendance_checkout_after_checkin
    check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);

create index if not exists attendance_session_idx  on public.attendance(session_id);
create index if not exists attendance_employee_idx on public.attendance(employee_id);
create index if not exists sessions_started_at_idx on public.sessions(started_at desc);

-- ── Check-in device log ──────────────────────────────────────────────────────
-- Append-only record of which phone made each check-in, so the supervisor can
-- see when one phone checked in several employees ("check in for my friend").
-- Nothing is ever refused — the log only records.
create table if not exists public.check_in_events (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions(id)  on delete cascade,
  employee_id       uuid not null references public.employees(id) on delete cascade,
  -- Random id from the device's localStorage (see src/utils/device.ts).
  device_id         text not null,
  -- Groups every check-in one device made inside the rolling 8-hour window.
  device_session_id uuid not null,
  -- Human-readable hint for the supervisor, e.g. "iPhone · Safari".
  device_label      text not null default '',
  at                timestamptz not null default now()
);

create index if not exists check_in_events_device_idx
  on public.check_in_events(device_id, at desc);
create index if not exists check_in_events_device_session_idx
  on public.check_in_events(device_session_id);
create index if not exists check_in_events_session_idx
  on public.check_in_events(session_id);
create index if not exists check_in_events_at_idx
  on public.check_in_events(at desc);

-- ── Employee self-service functions ──────────────────────────────────────────
-- Anonymous employees never touch the employees/attendance tables directly. All
-- their flows go through these security-definer functions, so the public anon
-- key (which ships in the browser bundle) cannot read or edit the roster — it
-- can only perform these specific operations.
--
-- Expected failures are raised with the exact code the app maps to a friendly
-- message (see src/services/data/errors.ts).

create or replace function public.register_employee(
  p_full_name text,
  p_phone     text,
  p_position  text default ''
) returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.employees;
  v_code text;
begin
  if exists (select 1 from public.employees where phone = p_phone) then
    raise exception 'PHONE_TAKEN';
  end if;

  v_code := lpad(nextval('public.employee_code_seq')::text, 3, '0');

  insert into public.employees (code, full_name, phone, "position")
  values (v_code, btrim(p_full_name), p_phone, btrim(coalesce(p_position, '')))
  returning * into v_row;

  return v_row;
end;
$$;

-- Single-employee lookup by exact phone (code recovery). Cannot enumerate rows.
create or replace function public.recover_employee_code(p_phone text)
returns public.employees
language sql
security definer
set search_path = public
as $$
  select * from public.employees where phone = p_phone limit 1;
$$;

-- Records the device the check-in came from, grouping every check-in one phone
-- makes inside `v_window` so the supervisor can see a phone used by more than
-- one employee. `v_window` mirrors DEVICE_SESSION_WINDOW_HOURS in
-- src/utils/device.ts — change them together.
drop function if exists public.check_in(uuid, text);
drop function if exists public.check_in(uuid, text, text, text);

create or replace function public.check_in(
  p_session_id   uuid,
  p_code         text,
  p_device_id    text default null,
  p_device_label text default ''
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session  public.sessions;
  v_employee public.employees;
  v_row      public.attendance;
  v_now      timestamptz := now();

  v_device_id      text := nullif(btrim(coalesce(p_device_id, '')), '');
  v_device_session uuid;

  v_window constant interval := interval '8 hours';
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then raise exception 'SESSION_CLOSED'; end if;

  select * into v_employee from public.employees where code = btrim(p_code);
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  if not v_session.check_in_open then raise exception 'CHECK_IN_CLOSED'; end if;

  -- Which device session does this check-in belong to? Re-use the one this
  -- phone opened if it is still inside the window, otherwise start a new one.
  if v_device_id is not null then
    select device_session_id
      into v_device_session
      from public.check_in_events
     where device_id = v_device_id
       and at > v_now - v_window
     order by at desc
     limit 1;

    if v_device_session is null then
      v_device_session := gen_random_uuid();
    end if;
  end if;

  select * into v_row from public.attendance
   where session_id = p_session_id and employee_id = v_employee.id;

  if found then
    if v_row.check_in_at is not null and v_row.check_out_at is null then
      raise exception 'ALREADY_CHECKED_IN';
    end if;
    update public.attendance
       set check_in_at = v_now, check_out_at = null
     where id = v_row.id
     returning * into v_row;
  else
    insert into public.attendance (session_id, employee_id, check_in_at)
    values (p_session_id, v_employee.id, v_now)
    returning * into v_row;
  end if;

  if v_device_session is not null then
    insert into public.check_in_events
      (session_id, employee_id, device_id, device_session_id, device_label, at)
    values
      (p_session_id, v_employee.id, v_device_id, v_device_session,
       btrim(coalesce(p_device_label, '')), v_now);
  end if;

  return v_row;
exception
  when unique_violation then
    raise exception 'ALREADY_CHECKED_IN';
end;
$$;

create or replace function public.check_out(p_session_id uuid, p_code text)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session  public.sessions;
  v_employee public.employees;
  v_row      public.attendance;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then raise exception 'SESSION_CLOSED'; end if;

  select * into v_employee from public.employees where code = btrim(p_code);
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  if not v_session.check_out_open then raise exception 'CHECK_OUT_CLOSED'; end if;

  select * into v_row from public.attendance
   where session_id = p_session_id and employee_id = v_employee.id;

  if not found or v_row.check_in_at is null then
    raise exception 'NOT_CHECKED_IN';
  end if;
  if v_row.check_out_at is not null then
    raise exception 'ALREADY_CHECKED_OUT';
  end if;

  update public.attendance
     set check_out_at = now()
   where id = v_row.id and check_out_at is null
   returning * into v_row;

  if not found then raise exception 'ALREADY_CHECKED_OUT'; end if;
  return v_row;
end;
$$;

-- ── Row-level security & grants ──────────────────────────────────────────────
alter table public.employees       enable row level security;
alter table public.sessions        enable row level security;
alter table public.attendance      enable row level security;
alter table public.check_in_events enable row level security;

grant usage on schema public to anon, authenticated;

-- Anon (employees) get NO direct access to employees/attendance — only the
-- functions above. They may read sessions to load the check-in screen.
grant select on public.sessions to anon, authenticated;
grant insert, update on public.sessions to authenticated;

-- Supervisors (authenticated) keep full access to the roster and attendance.
grant select, insert, update, delete on public.employees  to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;

-- The device log holds device ids: written by check_in (security definer),
-- readable only by a signed-in supervisor.
revoke all on public.check_in_events from anon;
grant select, delete on public.check_in_events to authenticated;

-- register_employee is ADMIN-ONLY (no public self-registration). Postgres
-- grants EXECUTE to PUBLIC by default and anon inherits PUBLIC, so revoke both.
revoke execute on function public.register_employee(text, text, text) from public, anon;
grant  execute on function public.register_employee(text, text, text) to authenticated;
grant execute on function public.recover_employee_code(text)       to anon, authenticated;
grant execute on function public.check_in(uuid, text, text, text)  to anon, authenticated;
grant execute on function public.check_out(uuid, text)             to anon, authenticated;
grant execute on function public.next_employee_code()              to authenticated;

drop policy if exists employees_all_authenticated       on public.employees;
drop policy if exists sessions_select_public            on public.sessions;
drop policy if exists sessions_insert_supervisor        on public.sessions;
drop policy if exists sessions_update_supervisor        on public.sessions;
drop policy if exists attendance_all_authenticated      on public.attendance;
drop policy if exists check_in_events_all_authenticated on public.check_in_events;
drop policy if exists check_in_events_owner_only        on public.check_in_events;

-- Employees: supervisor-only direct access. Anon uses the functions above.
create policy employees_all_authenticated
  on public.employees for all
  to authenticated
  using (true) with check (true);

-- Sessions: everyone may read (the check-in screen needs it); only a signed-in
-- supervisor may create or modify one.
create policy sessions_select_public
  on public.sessions for select
  to anon, authenticated
  using (true);

create policy sessions_insert_supervisor
  on public.sessions for insert
  to authenticated
  with check (true);

create policy sessions_update_supervisor
  on public.sessions for update
  to authenticated
  using (true)
  with check (true);

-- Attendance: supervisor-only direct access. Anon uses check_in / check_out.
create policy attendance_all_authenticated
  on public.attendance for all
  to authenticated
  using (true) with check (true);

-- Device log: supervisor-only. Anon never touches it directly. To narrow it
-- further to a single account, run supabase/restrict-device-log.sql.
create policy check_in_events_all_authenticated
  on public.check_in_events for all
  to authenticated
  using (true) with check (true);

-- Make PostgREST pick the new functions up immediately.
notify pgrst, 'reload schema';

-- ═════════════════════════════════════════════════════════════════════════════
-- Smoke test (optional)
--
-- Paste the block below into a NEW query and run it to prove the whole flow
-- works end to end. It creates a session, registers an employee, checks them
-- in and out, prints the result, then deletes everything it made.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- do $$
-- declare
--   v_session public.sessions;
--   v_emp     public.employees;
--   v_row     public.attendance;
-- begin
--   insert into public.sessions (supervisor_name, title, location, check_in_open, check_out_open)
--   values ('Smoke Test', 'Schema check', 'Nowhere', true, true)
--   returning * into v_session;
--
--   v_emp  := public.register_employee('Test Person', '+964000000000', 'Tester');
--   v_row  := public.check_in(v_session.id, v_emp.code, 'smoke-test-device', 'Test · Runner');
--   v_row  := public.check_out(v_session.id, v_emp.code);
--
--   raise notice 'OK — code % checked in %, out %', v_emp.code, v_row.check_in_at, v_row.check_out_at;
--
--   delete from public.sessions  where id = v_session.id;  -- cascades to attendance + log
--   delete from public.employees where id = v_emp.id;
-- end $$;

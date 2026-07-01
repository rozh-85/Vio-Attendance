-- QR Attendance — Supabase schema
-- Run this in the Supabase SQL editor to provision the backend, then set
-- VITE_DATA_BACKEND=supabase and the URL / anon key in your .env.

create extension if not exists "pgcrypto";

-- ── Students ──────────────────────────────────────────────────────────────────
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  full_name   text not null,
  phone       text not null unique,
  college     text not null default '',
  department  text not null default '',
  created_at  timestamptz not null default now()
);

-- Sequential 3-digit-style codes (001, 002, ...). Returns the next integer.
create sequence if not exists public.student_code_seq start 1;

create or replace function public.next_student_code()
returns integer
language sql
security definer
set search_path = public
as $$
  select nextval('public.student_code_seq')::integer;
$$;

do $$
declare
  max_code integer;
begin
  select coalesce(max(code::integer), 0)
    into max_code
    from public.students
   where code ~ '^[0-9]+$';

  perform setval('public.student_code_seq', greatest(max_code, 1), max_code > 0);
end $$;

-- ── Sessions ──────────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  lecturer_name  text not null,
  title          text not null default '',
  location       text not null default '',
  status         text not null default 'active' check (status in ('active','closed')),
  check_in_open  boolean not null default false,
  check_out_open boolean not null default false,
  started_at     timestamptz not null default now(),
  closed_at      timestamptz,
  constraint sessions_closed_after_start check (closed_at is null or closed_at >= started_at)
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.sessions'::regclass
       and conname = 'sessions_closed_after_start'
  ) then
    alter table public.sessions
      add constraint sessions_closed_after_start
      check (closed_at is null or closed_at >= started_at);
  end if;
end $$;

-- ── Attendance ────────────────────────────────────────────────────────────────
create table if not exists public.attendance (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  check_in_at  timestamptz,
  check_out_at timestamptz,
  constraint attendance_session_student_unique unique (session_id, student_id),
  constraint attendance_checkout_after_checkin
    check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);

do $$
declare
  session_col smallint;
  student_col smallint;
begin
  select attnum
    into session_col
    from pg_attribute
   where attrelid = 'public.attendance'::regclass
     and attname = 'session_id';

  select attnum
    into student_col
    from pg_attribute
   where attrelid = 'public.attendance'::regclass
     and attname = 'student_id';

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.attendance'::regclass
       and contype = 'u'
       and conkey = array[session_col, student_col]::smallint[]
  ) then
    alter table public.attendance
      add constraint attendance_session_student_unique unique (session_id, student_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.attendance'::regclass
       and conname = 'attendance_checkout_after_checkin'
  ) then
    alter table public.attendance
      add constraint attendance_checkout_after_checkin
      check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at);
  end if;
end $$;

create index if not exists attendance_session_idx on public.attendance(session_id);
create index if not exists attendance_student_idx on public.attendance(student_id);
create index if not exists sessions_started_at_idx on public.sessions(started_at desc);

-- ── Browser client access ───────────────────────────────────────────────────
-- This app currently uses the public anon key with no Supabase Auth login, so
-- these policies intentionally allow the classroom QR flows to read/write the
-- three app tables. Tighten these policies before using the project for data
-- that should not be publicly writable.
alter table public.students enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on public.students to anon, authenticated;
grant select, insert, update on public.sessions to anon, authenticated;
grant select, insert, update on public.attendance to anon, authenticated;
grant execute on function public.next_student_code() to anon, authenticated;

drop policy if exists students_select_public on public.students;
drop policy if exists students_insert_public on public.students;
drop policy if exists sessions_select_public on public.sessions;
drop policy if exists sessions_insert_public on public.sessions;
drop policy if exists sessions_update_public on public.sessions;
drop policy if exists attendance_select_public on public.attendance;
drop policy if exists attendance_insert_public on public.attendance;
drop policy if exists attendance_update_public on public.attendance;

create policy students_select_public
  on public.students for select
  to anon, authenticated
  using (true);

create policy students_insert_public
  on public.students for insert
  to anon, authenticated
  with check (true);

create policy sessions_select_public
  on public.sessions for select
  to anon, authenticated
  using (true);

create policy sessions_insert_public
  on public.sessions for insert
  to anon, authenticated
  with check (true);

create policy sessions_update_public
  on public.sessions for update
  to anon, authenticated
  using (true)
  with check (true);

create policy attendance_select_public
  on public.attendance for select
  to anon, authenticated
  using (true);

create policy attendance_insert_public
  on public.attendance for insert
  to anon, authenticated
  with check (true);

create policy attendance_update_public
  on public.attendance for update
  to anon, authenticated
  using (true)
  with check (true);

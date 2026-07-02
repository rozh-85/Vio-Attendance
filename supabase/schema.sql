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

-- ── Student self-service functions ───────────────────────────────────────────
-- Anonymous students never touch the students/attendance tables directly. All
-- their flows go through these security-definer functions, so the public anon
-- key (which ships in the browser bundle) cannot read or edit the roster — it
-- can only perform these four specific operations.

create or replace function public.register_student(
  p_full_name text,
  p_phone     text,
  p_college   text default '',
  p_department text default ''
) returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.students;
  v_code text;
begin
  if exists (select 1 from public.students where phone = p_phone) then
    raise exception 'PHONE_TAKEN';
  end if;

  v_code := lpad(nextval('public.student_code_seq')::text, 3, '0');

  insert into public.students (code, full_name, phone, college, department)
  values (v_code, btrim(p_full_name), p_phone, btrim(p_college), btrim(p_department))
  returning * into v_row;

  return v_row;
end;
$$;

-- Single-student lookup by exact phone (code recovery). Cannot enumerate rows.
create or replace function public.recover_student_code(p_phone text)
returns public.students
language sql
security definer
set search_path = public
as $$
  select * from public.students where phone = p_phone limit 1;
$$;

create or replace function public.check_in(p_session_id uuid, p_code text)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions;
  v_student public.students;
  v_row     public.attendance;
  v_now     timestamptz := now();
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then raise exception 'SESSION_CLOSED'; end if;

  select * into v_student from public.students where code = btrim(p_code);
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;

  if not v_session.check_in_open then raise exception 'CHECK_IN_CLOSED'; end if;

  select * into v_row from public.attendance
   where session_id = p_session_id and student_id = v_student.id;

  if found then
    if v_row.check_in_at is not null and v_row.check_out_at is null then
      raise exception 'ALREADY_CHECKED_IN';
    end if;
    update public.attendance
       set check_in_at = v_now, check_out_at = null
     where id = v_row.id
     returning * into v_row;
    return v_row;
  end if;

  insert into public.attendance (session_id, student_id, check_in_at)
  values (p_session_id, v_student.id, v_now)
  returning * into v_row;
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
  v_session public.sessions;
  v_student public.students;
  v_row     public.attendance;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then raise exception 'SESSION_CLOSED'; end if;

  select * into v_student from public.students where code = btrim(p_code);
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;

  if not v_session.check_out_open then raise exception 'CHECK_OUT_CLOSED'; end if;

  select * into v_row from public.attendance
   where session_id = p_session_id and student_id = v_student.id;

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

-- ── Row-level security & grants ───────────────────────────────────────────────
alter table public.students enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;

grant usage on schema public to anon, authenticated;

-- Anon (students) get NO direct access to students/attendance — only the
-- functions above. They may read sessions to load the check-in screen.
grant select on public.sessions to anon, authenticated;
grant insert, update on public.sessions to authenticated;

-- Lecturers (authenticated) keep full access to every table.
grant select, insert, update, delete on public.students   to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;

grant execute on function public.register_student(text, text, text, text) to anon, authenticated;
grant execute on function public.recover_student_code(text)               to anon, authenticated;
grant execute on function public.check_in(uuid, text)                     to anon, authenticated;
grant execute on function public.check_out(uuid, text)                    to anon, authenticated;
grant execute on function public.next_student_code() to authenticated;

drop policy if exists students_select_public on public.students;
drop policy if exists students_insert_public on public.students;
drop policy if exists students_update_public on public.students;
drop policy if exists students_all_authenticated on public.students;
drop policy if exists sessions_select_public on public.sessions;
drop policy if exists sessions_insert_public on public.sessions;
drop policy if exists sessions_update_public on public.sessions;
drop policy if exists sessions_insert_lecturer on public.sessions;
drop policy if exists sessions_update_lecturer on public.sessions;
drop policy if exists attendance_select_public on public.attendance;
drop policy if exists attendance_insert_public on public.attendance;
drop policy if exists attendance_update_public on public.attendance;
drop policy if exists attendance_all_authenticated on public.attendance;

-- Students: lecturer-only direct access. Anon uses the functions above.
create policy students_all_authenticated
  on public.students for all
  to authenticated
  using (true) with check (true);

-- Sessions: everyone may read; only lecturers may create/modify.
create policy sessions_select_public
  on public.sessions for select
  to anon, authenticated
  using (true);

create policy sessions_insert_lecturer
  on public.sessions for insert
  to authenticated
  with check (true);

create policy sessions_update_lecturer
  on public.sessions for update
  to authenticated
  using (true)
  with check (true);

-- Attendance: lecturer-only direct access. Anon uses check_in / check_out.
create policy attendance_all_authenticated
  on public.attendance for all
  to authenticated
  using (true) with check (true);

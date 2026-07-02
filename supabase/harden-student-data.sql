-- ─────────────────────────────────────────────────────────────────────────────
-- Lock down student & attendance data against the public anon key.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is safe to re-run and does not touch existing data.
--
-- WHY: the anon key ships in the browser bundle, so anyone can copy it from the
-- devtools console. Until now the RLS policies let that key read and edit every
-- row in `students` and `attendance` — i.e. download the whole roster (names +
-- phone numbers). This migration removes ALL direct anon access to those tables
-- and instead exposes only four narrow, security-definer functions for the
-- student-facing flows:
--     • register_student      • recover_student_code
--     • check_in              • check_out
-- Signed-in lecturers (the `authenticated` role) keep full access as before.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Student self-service functions (run with definer rights, bypassing RLS) ───

-- Register a new student: guards duplicate phones and allocates the next code.
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

-- Look up a single student by their exact phone number (code-recovery screen).
-- Returns NULL when no match. Cannot enumerate the table — the caller must
-- already know the full phone number.
create or replace function public.recover_student_code(p_phone text)
returns public.students
language sql
security definer
set search_path = public
as $$
  select * from public.students where phone = p_phone limit 1;
$$;

-- Check a student in for a session, identified by their code.
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
    -- Concurrent check-in inserted the row first; treat as already checked in.
    raise exception 'ALREADY_CHECKED_IN';
end;
$$;

-- Check a student out of a session, identified by their code.
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

-- ── (1) Row-level security ON for every table ─────────────────────────────────
-- Idempotent: enabling it when it is already on is a harmless no-op.
alter table public.students   enable row level security;
alter table public.sessions   enable row level security;
alter table public.attendance enable row level security;

grant usage on schema public to anon, authenticated;

-- ── (2/3/4) Remove ALL direct anon access to the sensitive tables ─────────────
-- After this the anon key cannot SELECT, INSERT, UPDATE or DELETE these tables
-- directly — it can only call the safe functions above.
revoke all on public.students   from anon;
revoke all on public.attendance from anon;
revoke execute on function public.next_student_code() from anon;

-- Drop every old permissive policy that allowed anon read/write.
drop policy if exists students_select_public   on public.students;
drop policy if exists students_insert_public   on public.students;
drop policy if exists students_update_public   on public.students;
drop policy if exists attendance_select_public  on public.attendance;
drop policy if exists attendance_insert_public  on public.attendance;
drop policy if exists attendance_update_public  on public.attendance;

-- ── Sessions: anyone may READ (to load the check-in screen); only a signed-in
--     lecturer may create / change them. Anon gets no write access. ────────────
revoke insert, update, delete on public.sessions from anon;
grant select on public.sessions to anon, authenticated;
grant insert, update on public.sessions to authenticated;

drop policy if exists sessions_select_public    on public.sessions;
drop policy if exists sessions_insert_public    on public.sessions;
drop policy if exists sessions_update_public    on public.sessions;
drop policy if exists sessions_insert_lecturer  on public.sessions;
drop policy if exists sessions_update_lecturer  on public.sessions;

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
  using (true) with check (true);

-- ── (6) Lecturers (authenticated / admin login) keep full access ──────────────
grant select, insert, update, delete on public.students   to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;

drop policy if exists students_all_authenticated   on public.students;
drop policy if exists attendance_all_authenticated on public.attendance;

create policy students_all_authenticated
  on public.students for all
  to authenticated
  using (true) with check (true);

create policy attendance_all_authenticated
  on public.attendance for all
  to authenticated
  using (true) with check (true);

-- ── (5) Expose only the safe student functions to the anon key ────────────────
grant execute on function public.register_student(text, text, text, text) to anon, authenticated;
grant execute on function public.recover_student_code(text)               to anon, authenticated;
grant execute on function public.check_in(uuid, text)                     to anon, authenticated;
grant execute on function public.check_out(uuid, text)                    to anon, authenticated;

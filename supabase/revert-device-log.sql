-- ─────────────────────────────────────────────────────────────────────────────
-- Put the device log back the way it was before the password lock.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run. It changes no attendance or student data.
--
-- WHAT IT UNDOES
--   • Restores `check_in` with the original 8-hour device-session window.
--   • Gives signed-in lecturers back read access to `check_in_events`.
--   • Removes the password-checked reader and the table that held its digest.
--
-- AFTER THIS the device log is readable by any signed-in lecturer again, which
-- is how it worked before. The /rozhadmin page still asks for its password, but
-- that is a screen lock only.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Remove the password lock ──────────────────────────────────────────────
drop function if exists public.list_check_in_events(text, timestamptz);
drop table    if exists public.device_log_key;

-- ── 2. Give lecturers back their read access ─────────────────────────────────
alter table public.check_in_events enable row level security;

revoke all on public.check_in_events from anon;
grant select, delete on public.check_in_events to authenticated;

drop policy if exists check_in_events_owner_only        on public.check_in_events;
drop policy if exists check_in_events_all_authenticated on public.check_in_events;
create policy check_in_events_all_authenticated
  on public.check_in_events for all
  to authenticated
  using (true) with check (true);

-- ── 3. Restore check_in with the 8-hour window ───────────────────────────────
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
  v_session public.sessions;
  v_student public.students;
  v_row     public.attendance;
  v_now     timestamptz := now();

  v_device_id      text := nullif(btrim(coalesce(p_device_id, '')), '');
  v_device_session uuid;

  -- Keep in sync with DEVICE_SESSION_WINDOW_HOURS in src/utils/device.ts.
  v_window constant interval := interval '8 hours';
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then raise exception 'SESSION_CLOSED'; end if;

  select * into v_student from public.students where code = btrim(p_code);
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;

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
   where session_id = p_session_id and student_id = v_student.id;

  if found then
    if v_row.check_in_at is not null and v_row.check_out_at is null then
      raise exception 'ALREADY_CHECKED_IN';
    end if;
    update public.attendance
       set check_in_at = v_now, check_out_at = null
     where id = v_row.id
     returning * into v_row;
  else
    insert into public.attendance (session_id, student_id, check_in_at)
    values (p_session_id, v_student.id, v_now)
    returning * into v_row;
  end if;

  if v_device_session is not null then
    insert into public.check_in_events
      (session_id, student_id, device_id, device_session_id, device_label, at)
    values
      (p_session_id, v_student.id, v_device_id, v_device_session,
       btrim(coalesce(p_device_label, '')), v_now);
  end if;

  return v_row;
exception
  when unique_violation then
    raise exception 'ALREADY_CHECKED_IN';
end;
$$;

grant execute on function public.check_in(uuid, text, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

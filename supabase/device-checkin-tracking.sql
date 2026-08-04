-- ─────────────────────────────────────────────────────────────────────────────
-- Record which phone each check-in came from, so proxy check-ins are visible.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is safe to re-run and does not touch existing data.
--
-- WHAT IT DOES
--   • Adds `check_in_events` — an append-only log of every check-in together
--     with the device (phone/browser) that made it.
--   • The first check-in from a phone opens a "device session" that lasts
--     8 hours; every later check-in from that phone inside the window joins the
--     same device session. When one device session covers more than one
--     student, the lecturer sees all their names on the session screen.
--
-- Nothing is ever refused: a phone may check in as many students as it likes
-- and every one of them is reported. Re-running this file also lifts the
-- 3-student limit an earlier version of it installed.
--
-- Keep the window below in sync with DEVICE_SESSION_WINDOW_HOURS in
-- src/utils/device.ts.
--
-- The device id is a random value the student's browser stores in its own
-- localStorage. It is a deterrent that makes casual "check in for my friend"
-- obvious — not a security guarantee: clearing site data yields a fresh id.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Device log ────────────────────────────────────────────────────────────────
create table if not exists public.check_in_events (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  -- Random id from the device's localStorage (see src/utils/device.ts).
  device_id         text not null,
  -- Groups every check-in one device made inside the rolling window.
  device_session_id uuid not null,
  -- Human-readable hint for the lecturer, e.g. "iPhone · Safari".
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

-- ── check_in(): now also records the device and enforces the limit ────────────
-- Drop the old two-argument version first: leaving both in place would make a
-- two-argument call ambiguous. The new one defaults the device arguments, so a
-- browser still running the previous bundle keeps working (untracked).
drop function if exists public.check_in(uuid, text);

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

-- ── Row-level security & grants ───────────────────────────────────────────────
-- The log holds device ids, so anon gets no access at all — rows are written by
-- the security-definer function above and read only by signed-in lecturers.
alter table public.check_in_events enable row level security;

revoke all on public.check_in_events from anon;
grant select, delete on public.check_in_events to authenticated;

drop policy if exists check_in_events_all_authenticated on public.check_in_events;
create policy check_in_events_all_authenticated
  on public.check_in_events for all
  to authenticated
  using (true) with check (true);

grant execute on function public.check_in(uuid, text, text, text)
  to anon, authenticated;

-- Let PostgREST pick up the new table / function signature immediately.
notify pgrst, 'reload schema';

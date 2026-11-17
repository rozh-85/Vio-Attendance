-- ─────────────────────────────────────────────────────────────────────────────
-- The supervisor's own note on one employee's attendance in one session: the
-- note button on the session screen. Shown there and on the employee report,
-- and printed on the employee PDF under that session.
--
-- Kept in its own table, not as a column of public.attendance: check_in and
-- check_out hand the whole attendance row back to the employee's phone, and a
-- supervisor's note must never travel with it. Only a signed-in supervisor
-- can read or write a note.
--
-- Run this in the Supabase SQL editor, after schema.sql. Safe to re-run. No
-- existing data changes.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.attendance_notes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id)  on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  note        text not null check (char_length(btrim(note)) between 1 and 1000),
  updated_at  timestamptz not null default now(),
  unique (session_id, employee_id)
);

alter table public.attendance_notes enable row level security;

revoke all on public.attendance_notes from anon;
grant select, insert, update, delete on public.attendance_notes to authenticated;

drop policy if exists attendance_notes_all_authenticated on public.attendance_notes;
create policy attendance_notes_all_authenticated
  on public.attendance_notes for all
  to authenticated
  using (true) with check (true);

notify pgrst, 'reload schema';

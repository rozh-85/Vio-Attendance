-- ─────────────────────────────────────────────────────────────────────────────
-- Restrict session creation / modification to signed-in lecturers.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is safe to run on an existing database — it only swaps a few RLS policies
-- and grants, and does not touch any data.
--
-- After this, the public anon key (which ships in the browser bundle) can still:
--   • register students        • read a session to show the check-in screen
--   • check in / check out
-- …but can NO LONGER create or edit sessions. Only an authenticated lecturer can.
-- ─────────────────────────────────────────────────────────────────────────────

-- Table grants: students may read sessions; only lecturers may write them.
revoke insert, update on public.sessions from anon;
grant select on public.sessions to anon, authenticated;
grant insert, update on public.sessions to authenticated;

-- Replace the old public write policies with lecturer-only ones.
drop policy if exists sessions_insert_public on public.sessions;
drop policy if exists sessions_update_public on public.sessions;
drop policy if exists sessions_insert_lecturer on public.sessions;
drop policy if exists sessions_update_lecturer on public.sessions;

create policy sessions_insert_lecturer
  on public.sessions for insert
  to authenticated
  with check (true);

create policy sessions_update_lecturer
  on public.sessions for update
  to authenticated
  using (true)
  with check (true);

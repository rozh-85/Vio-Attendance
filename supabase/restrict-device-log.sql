-- ─────────────────────────────────────────────────────────────────────────────
-- Restrict the shared-phone device log to ONE account. (Optional.)
--
-- Run this in the Supabase SQL editor after schema.sql. Safe to re-run. It
-- changes no data — only who may read `check_in_events`.
--
-- WHY: schema.sql lets every signed-in supervisor read the log. The app hides
-- the report from everyone but the owner, but that is a screen rule, not a
-- database one: another supervisor with the site's anon key and their own
-- session could still query the table. This makes the restriction real.
--
-- ⚠ SET THE EMAIL BELOW FIRST. It must be the email of the **Supabase login
--   account** you use at /VioAdmin — not the password you type on the
--   /rozhadmin page, which is a separate screen lock. Put the wrong address in
--   and the report will simply come up empty for you; re-run with the right one
--   to fix it.
--
-- To find it: Supabase Dashboard → Authentication → Users.
--
-- To undo (give every supervisor access back), re-run schema.sql.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  -- ⚠ CHANGE THIS to your Supabase login email.
  v_owner_email constant text := 'rozh@gmail.com';
begin
  execute format(
    $f$
      drop policy if exists check_in_events_all_authenticated on public.check_in_events;
      drop policy if exists check_in_events_owner_only        on public.check_in_events;

      create policy check_in_events_owner_only
        on public.check_in_events for all
        to authenticated
        using      (coalesce(auth.jwt() ->> 'email', '') = %L)
        with check (coalesce(auth.jwt() ->> 'email', '') = %L);
    $f$,
    v_owner_email,
    v_owner_email
  );
end $$;

-- Employees keep checking in exactly as before: rows are written by the
-- `check_in` function, which is SECURITY DEFINER and so bypasses this policy.

notify pgrst, 'reload schema';

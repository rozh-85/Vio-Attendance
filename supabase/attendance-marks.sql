-- ─────────────────────────────────────────────────────────────────────────────
-- The supervisor's mark on one employee's attendance in one session: the ⋯
-- menu on the session screen (off, not their shift, overtime, hourly leave,
-- official leave, weekend, public holiday, annual leave, sick leave, early
-- leave, late, administrative leave). Printed on the employee PDF and the
-- Excel sheets; on a missed session it replaces "Absent" and counts as excused.
--
-- Run this in the Supabase SQL editor, after schema.sql. Safe to re-run, and
-- run it again whenever the list of marks grows. No existing data changes.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.attendance
  add column if not exists mark text;

alter table public.attendance drop constraint if exists attendance_mark_check;
alter table public.attendance
  add constraint attendance_mark_check
    check (mark in (
      'off', 'not-their-shift', 'overtime', 'hourly-leave', 'official-leave',
      'weekend', 'public-holiday', 'annual-leave', 'sick-leave', 'early-leave',
      'late', 'administrative-leave'
    ));

notify pgrst, 'reload schema';

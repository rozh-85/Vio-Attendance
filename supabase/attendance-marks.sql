-- ─────────────────────────────────────────────────────────────────────────────
-- The supervisor's mark on one employee's attendance in one session: the ⋯
-- menu on the session screen (off, not their shift, overtime, hourly leave,
-- official leave). Printed on the employee PDF and the Excel sheets; on a
-- missed session it replaces "Absent" and counts as excused.
--
-- Run this once in the Supabase SQL editor, after schema.sql. Safe to re-run.
-- It only adds a column; no existing data changes.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.attendance
  add column if not exists mark text
    constraint attendance_mark_check
    check (mark in ('off', 'not-their-shift', 'overtime', 'hourly-leave', 'official-leave'));

notify pgrst, 'reload schema';

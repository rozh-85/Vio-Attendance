-- ─────────────────────────────────────────────────────────────────────────────
-- Lock the shared-phone device log to whoever knows the owner password.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run. It changes no data — only who may read `check_in_events`.
--
-- WHY
-- Every lecturer signs in with the same Supabase account, so "restrict the
-- table to one account" cannot separate the owner from them — they are all that
-- account. Hiding the report in the browser is not enough either: anyone with
-- devtools could ask PostgREST for `check_in_events` directly and read which
-- students were checked in from one phone.
--
-- WHAT THIS DOES
--   • Takes away every role's right to read the table directly.
--   • Adds `list_check_in_events(password, since)` as the only way in. It
--     returns rows only when the password's SHA-256 matches the digest stored
--     below, so the password — not the shared account — is the real lock.
--
-- Students keep checking in exactly as before: rows are written by `check_in`,
-- which is SECURITY DEFINER and so unaffected by any of this.
--
-- ⚠ The digest below must match the app's password. It is the SHA-256 of the
--   password typed at /rozhadmin. Change one and you must change the other, or
--   the report will open and then come up empty. To use a different password:
--     • put its SHA-256 in `v_password_sha256` here, and
--     • set VITE_OWNER_PASSWORD to the password in your Vercel env vars.
--   Generate a digest with:  echo -n 'yourpassword' | sha256sum
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── 1. Nobody reads the log directly any more ────────────────────────────────
alter table public.check_in_events enable row level security;

-- Both earlier policies let any signed-in lecturer read the table.
drop policy if exists check_in_events_all_authenticated on public.check_in_events;
drop policy if exists check_in_events_owner_only        on public.check_in_events;

revoke all on public.check_in_events from anon, authenticated;

-- ── 2. Where the password lives ──────────────────────────────────────────────
-- Only the digest is stored, so the table never holds the password itself.
-- The single-row shape (`id` is always true) keeps it impossible to add a
-- second, competing key by accident.
create table if not exists public.device_log_key (
  id              boolean primary key default true check (id),
  password_sha256 text not null
);

alter table public.device_log_key enable row level security;
revoke all on public.device_log_key from anon, authenticated;

do $$
declare
  -- ⚠ SHA-256 of the owner password. Mirrors OWNER_PASSWORD_SHA256 in
  --   src/services/auth/ownerGate.ts.
  v_password_sha256 constant text :=
    '3a1bdf732b0f1fa4866609122fb117a528f860ca8e030575f626e4272d5b17a0';
begin
  insert into public.device_log_key (id, password_sha256)
  values (true, v_password_sha256)
  on conflict (id) do update set password_sha256 = excluded.password_sha256;
end $$;

-- ── 3. The only door to the log ──────────────────────────────────────────────
create or replace function public.list_check_in_events(
  p_password text,
  p_since    timestamptz default null
)
returns setof public.check_in_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select password_sha256 into v_expected from public.device_log_key where id;

  -- No key configured, or the wrong password: same answer either way, so a
  -- caller learns nothing from which one it was.
  if v_expected is null
     or encode(digest(coalesce(p_password, ''), 'sha256'), 'hex')
        is distinct from v_expected
  then
    raise exception 'NOT_AUTHORISED';
  end if;

  return query
    select e.*
      from public.check_in_events e
     where p_since is null or e.at >= p_since
     order by e.at desc;
end;
$$;

-- Signing in is still required on top of the password: anon cannot call it.
revoke all on function public.list_check_in_events(text, timestamptz)
  from public, anon;
grant execute on function public.list_check_in_events(text, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';

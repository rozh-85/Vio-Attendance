-- Vio admin maintenance switch
--
-- Run after schema.sql. One boolean the owner flips from /owner to put the two
-- admin areas — /VioAdmin (the supervisor sign-in) and /rozhadmin (the owner
-- reports) — behind a "service is down" maintenance screen for everyone but the
-- owner's own browser. Employee check-in pages are never affected.
--
-- Reads are public: the sign-in pages are shown before anyone authenticates, so
-- the maintenance screen has to be decidable without a session. Writes go only
-- through the function below, which re-checks the owner key, so a casual caller
-- cannot flip the switch. As with the other owner gates in this app, this hides
-- the admin areas; it is not a security boundary (the real data stays protected
-- by each table's own row-level security).

create table if not exists public.vio_admin_lockdown (
  id         integer primary key default 1,
  locked     boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint vio_admin_lockdown_single_row check (id = 1)
);

-- Exactly one row, id = 1, created once and never duplicated.
insert into public.vio_admin_lockdown (id, locked)
  values (1, false)
  on conflict (id) do nothing;

alter table public.vio_admin_lockdown enable row level security;

-- Anyone may read the switch (the admin sign-in pages render before auth).
drop policy if exists vio_admin_lockdown_read on public.vio_admin_lockdown;
create policy vio_admin_lockdown_read
  on public.vio_admin_lockdown for select
  to anon, authenticated
  using (true);

-- No write policy: the row is written only through vio_set_admin_lockdown.

-- Flip the switch. p_key is the SHA-256 of the owner password, matching the
-- OWNER_KEY_SHA256 constant in src/services/auth/adminLockdown.ts — change both
-- together if the password changes.
create or replace function public.vio_set_admin_lockdown(p_locked boolean, p_key text)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if p_key is distinct from
       '81a84dfdc5346cddeab9a1316ceb1a32f7d50178ce44a9838c2a6152a14f76e3' then
    raise exception 'forbidden';
  end if;
  update public.vio_admin_lockdown
    set locked = p_locked, updated_at = now()
    where id = 1;
  return p_locked;
end;
$$;

revoke all on function public.vio_set_admin_lockdown(boolean, text) from public;
grant execute on function public.vio_set_admin_lockdown(boolean, text) to anon, authenticated;

notify pgrst, 'reload schema';

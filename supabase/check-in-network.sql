-- ─────────────────────────────────────────────────────────────────────────────
-- Record the network each check-in came from, so a VPN shows up. (Optional.)
--
-- Run this once in the Supabase SQL editor, after schema.sql. Safe to re-run.
-- It changes no existing data and does not touch the check_in function: a
-- trigger fills two new columns on check_in_events from the request itself,
-- so every client — old or new — gets them.
--
--   ip_address  the phone's public address, as Supabase's edge saw it
--   ip_country  that address's country, two letters, from Cloudflare (which
--               sits in front of every Supabase project); "T1" means Tor
--
-- A VPN changes these two and never the GPS, so it cannot move a check-in into
-- a work location. What it does do is put the network in another country: the
-- owner page /rozhadmin/locations marks every check-in whose network is outside
-- the home country (VITE_HOME_COUNTRY, "IQ" by default) as a likely VPN.
--
-- Like the GPS columns these are readable only by a signed-in supervisor (or
-- only the owner, after restrict-device-log.sql). Employees never see them.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.check_in_events
  add column if not exists ip_address text,
  add column if not exists ip_country text;

create or replace function public.check_in_events_capture_network()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_headers json;
  v_country text;
begin
  -- Only requests that came through the Data API carry headers. A row written
  -- from the SQL editor simply stays without network details.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  if v_headers is null then
    return new;
  end if;

  -- cf-connecting-ip is set by Cloudflare and cannot be supplied by the phone;
  -- x-forwarded-for is the fallback the Supabase docs use.
  new.ip_address := coalesce(
    new.ip_address,
    left(coalesce(
      nullif(btrim(v_headers->>'cf-connecting-ip'), ''),
      nullif(btrim(split_part(v_headers->>'x-forwarded-for', ',', 1)), ''),
      nullif(btrim(v_headers->>'x-real-ip'), '')
    ), 64)
  );

  -- "XX" is Cloudflare's "unknown"; "T1" (Tor) is kept on purpose.
  v_country := upper(btrim(coalesce(v_headers->>'cf-ipcountry', '')));
  if new.ip_country is null and v_country ~ '^[A-Z][A-Z0-9]$' and v_country <> 'XX' then
    new.ip_country := v_country;
  end if;

  return new;
end;
$$;

drop trigger if exists check_in_events_capture_network on public.check_in_events;
create trigger check_in_events_capture_network
  before insert on public.check_in_events
  for each row execute function public.check_in_events_capture_network();

notify pgrst, 'reload schema';

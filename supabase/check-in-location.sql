-- Add optional GPS to the private check-in report.
-- Run this once in Supabase after the existing schema.sql. Check-ins still
-- work when a phone declines location access; those rows keep NULL coordinates.

alter table public.check_in_events
  add column if not exists latitude   numeric(9,6),
  add column if not exists longitude  numeric(9,6),
  add column if not exists accuracy_m numeric(8,2);

-- Keep the existing four-argument check_in function for older clients, and add
-- a seven-argument overload for the new web client. This function repeats the
-- small attendance write so it also works when the main schema has already
-- been upgraded and no four-argument overload remains.
create or replace function public.check_in(
  p_session_id   uuid,
  p_code         text,
  p_device_id    text,
  p_device_label text,
  p_latitude     numeric,
  p_longitude    numeric,
  p_accuracy     numeric
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session  public.sessions;
  v_employee public.employees;
  v_row      public.attendance;
  v_now      timestamptz := now();

  v_device_id      text := nullif(btrim(coalesce(p_device_id, '')), '');
  v_device_session uuid;

  v_window constant interval := interval '8 hours';
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then raise exception 'SESSION_CLOSED'; end if;

  select * into v_employee from public.employees where code = btrim(p_code);
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  if not v_session.check_in_open then raise exception 'CHECK_IN_CLOSED'; end if;

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
   where session_id = p_session_id and employee_id = v_employee.id;

  if found then
    if v_row.check_in_at is not null and v_row.check_out_at is null then
      raise exception 'ALREADY_CHECKED_IN';
    end if;
    update public.attendance
       set check_in_at = v_now, check_out_at = null
     where id = v_row.id
     returning * into v_row;
  else
    insert into public.attendance (session_id, employee_id, check_in_at)
    values (p_session_id, v_employee.id, v_now)
    returning * into v_row;
  end if;

  if v_device_session is not null then
    insert into public.check_in_events
      (session_id, employee_id, device_id, device_session_id, device_label,
       latitude, longitude, accuracy_m, at)
    values
      (p_session_id, v_employee.id, v_device_id, v_device_session,
       btrim(coalesce(p_device_label, '')),
       case when p_latitude between -90 and 90 then p_latitude end,
       case when p_longitude between -180 and 180 then p_longitude end,
       case when p_accuracy >= 0 then p_accuracy end,
       v_now);
  end if;

  return v_row;
exception
  when unique_violation then
    raise exception 'ALREADY_CHECKED_IN';
end;
$$;

grant execute on function public.check_in(uuid, text, text, text, numeric, numeric, numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';

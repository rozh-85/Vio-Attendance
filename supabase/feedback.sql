-- Vio product feedback
--
-- Run after schema.sql and catalog.sql. Products remain in the single Master
-- Catalog; every feedback and share link stores exactly one Master product id.

create table if not exists public.feedback_links (
  id               uuid primary key default gen_random_uuid(),
  product_id       text not null,
  token            text not null unique,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz,
  submission_count bigint not null default 0 check (submission_count >= 0)
);

create table if not exists public.product_feedback (
  id               uuid primary key default gen_random_uuid(),
  product_id       text not null,
  customer_name    text,
  feedback_text    text,
  image_path       text,
  source           text not null check (source in ('manual', 'customer_link')),
  internal_note    text,
  feedback_link_id uuid references public.feedback_links(id) on delete set null,
  feedback_date    date not null default current_date,
  created_at       timestamptz not null default now(),
  constraint product_feedback_has_content check (
    nullif(btrim(feedback_text), '') is not null
    or nullif(btrim(image_path), '') is not null
  )
);

create index if not exists product_feedback_product_id_idx
  on public.product_feedback(product_id);
create index if not exists product_feedback_date_idx
  on public.product_feedback(feedback_date desc, created_at desc);
create index if not exists feedback_links_product_id_idx
  on public.feedback_links(product_id, is_active);
create unique index if not exists feedback_links_one_active_per_product_idx
  on public.feedback_links(product_id)
  where is_active;

-- This requested account is intentionally limited to the feedback workspace.
-- The password remains only in Supabase Auth and is never stored in this app.
create or replace function public.is_feedback_manager()
returns boolean
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'feedback@gmail.com';
$$;

revoke all on function public.is_feedback_manager() from public, anon;
grant execute on function public.is_feedback_manager() to authenticated;

-- Existing attendance policies are permissive for supervisors. Restrictive
-- policies combine with them and keep the feedback-only account out, without
-- changing access for existing administrator accounts.
drop policy if exists feedback_manager_no_employees on public.employees;
create policy feedback_manager_no_employees
  on public.employees as restrictive for all to authenticated
  using (not public.is_feedback_manager())
  with check (not public.is_feedback_manager());

drop policy if exists feedback_manager_no_sessions on public.sessions;
create policy feedback_manager_no_sessions
  on public.sessions as restrictive for all to authenticated
  using (not public.is_feedback_manager())
  with check (not public.is_feedback_manager());

drop policy if exists feedback_manager_no_attendance on public.attendance;
create policy feedback_manager_no_attendance
  on public.attendance as restrictive for all to authenticated
  using (not public.is_feedback_manager())
  with check (not public.is_feedback_manager());

drop policy if exists feedback_manager_no_leave_allowances on public.leave_allowances;
create policy feedback_manager_no_leave_allowances
  on public.leave_allowances as restrictive for all to authenticated
  using (not public.is_feedback_manager())
  with check (not public.is_feedback_manager());

drop policy if exists feedback_manager_no_leave_records on public.leave_records;
create policy feedback_manager_no_leave_records
  on public.leave_records as restrictive for all to authenticated
  using (not public.is_feedback_manager())
  with check (not public.is_feedback_manager());

drop policy if exists feedback_manager_no_device_log on public.check_in_events;
create policy feedback_manager_no_device_log
  on public.check_in_events as restrictive for all to authenticated
  using (not public.is_feedback_manager())
  with check (not public.is_feedback_manager());

-- Feedback managers need read-only product names/images from the Master
-- Catalog, but cannot change products or inspect catalog draft documents.
drop policy if exists feedback_manager_no_master_insert on public.vio_catalog_master;
create policy feedback_manager_no_master_insert
  on public.vio_catalog_master as restrictive for insert to authenticated
  with check (not public.is_feedback_manager());

drop policy if exists feedback_manager_no_master_update on public.vio_catalog_master;
create policy feedback_manager_no_master_update
  on public.vio_catalog_master as restrictive for update to authenticated
  using (not public.is_feedback_manager())
  with check (not public.is_feedback_manager());

drop policy if exists feedback_manager_no_master_delete on public.vio_catalog_master;
create policy feedback_manager_no_master_delete
  on public.vio_catalog_master as restrictive for delete to authenticated
  using (not public.is_feedback_manager());

drop policy if exists feedback_manager_no_catalog_drafts on public.vio_catalog_drafts;
create policy feedback_manager_no_catalog_drafts
  on public.vio_catalog_drafts as restrictive for all to authenticated
  using (not public.is_feedback_manager())
  with check (not public.is_feedback_manager());

-- Because Master products are intentionally stored as one JSON document, this
-- trigger provides the same protection a normal product foreign key would.
create or replace function public.feedback_product_exists(p_product_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vio_catalog_master as master
    cross join lateral jsonb_array_elements(master.products) as product
    where master.id = 'default'
      and product ->> 'id' = p_product_id
  );
$$;

create or replace function public.enforce_feedback_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_id is null or not public.feedback_product_exists(new.product_id) then
    raise exception 'The selected Master Catalog product does not exist.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists product_feedback_product_guard on public.product_feedback;
create trigger product_feedback_product_guard
before insert or update of product_id on public.product_feedback
for each row execute function public.enforce_feedback_product();

drop trigger if exists feedback_links_product_guard on public.feedback_links;
create trigger feedback_links_product_guard
before insert or update of product_id on public.feedback_links
for each row execute function public.enforce_feedback_product();

alter table public.product_feedback enable row level security;
alter table public.feedback_links enable row level security;

drop policy if exists product_feedback_authenticated on public.product_feedback;
create policy product_feedback_authenticated
  on public.product_feedback for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists feedback_links_authenticated on public.feedback_links;
create policy feedback_links_authenticated
  on public.feedback_links for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

revoke all on table public.product_feedback from anon;
revoke all on table public.feedback_links from anon;
grant select, insert, update, delete on table public.product_feedback to authenticated;
grant select, insert, update, delete on table public.feedback_links to authenticated;

-- Rotate links on the server so tokens are never predictable and only one
-- active link remains for a product.
create or replace function public.generate_feedback_link(
  p_product_id text,
  p_expires_at timestamptz default null
)
returns table (
  id uuid,
  product_id text,
  token text,
  is_active boolean,
  created_at timestamptz,
  expires_at timestamptz,
  submission_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.feedback_links;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.feedback_product_exists(p_product_id) then
    raise exception 'The selected Master Catalog product does not exist.' using errcode = '23503';
  end if;

  update public.feedback_links
  set is_active = false
  where feedback_links.product_id = p_product_id and feedback_links.is_active;

  insert into public.feedback_links(product_id, token, expires_at)
  values (p_product_id, replace(gen_random_uuid()::text, '-', ''), p_expires_at)
  returning * into created;

  return query select created.id, created.product_id, created.token,
    created.is_active, created.created_at, created.expires_at,
    created.submission_count;
end;
$$;

-- Public visitors receive only the two fields needed to render the form. The
-- product id, feedback rows, link row, and all admin data remain private.
create or replace function public.get_feedback_product(p_token text)
returns table (product_name text, product_image text)
language sql
stable
security definer
set search_path = ''
as $$
  select product ->> 'name', coalesce(product ->> 'mainImage', '')
  from public.feedback_links as link
  join public.vio_catalog_master as master on master.id = 'default'
  cross join lateral jsonb_array_elements(master.products) as product
  where link.token = p_token
    and link.is_active
    and (link.expires_at is null or link.expires_at > now())
    and product ->> 'id' = link.product_id
  limit 1;
$$;

-- Storage upload paths for anonymous visitors are accepted only when their
-- first folder contains a currently-valid feedback token.
create or replace function public.is_valid_feedback_upload(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    split_part(p_object_name, '/', 1) = 'submissions'
    and split_part(p_object_name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(p_object_name, '/', 4) = 'image.webp'
    and split_part(p_object_name, '/', 5) = ''
    and exists (
      select 1 from public.feedback_links as link
      where link.token = split_part(p_object_name, '/', 2)
        and link.is_active
        and (link.expires_at is null or link.expires_at > now())
    );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-images', 'feedback-images', false, 10485760, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists feedback_images_authenticated_select on storage.objects;
create policy feedback_images_authenticated_select
  on storage.objects for select to authenticated
  using (bucket_id = 'feedback-images');

drop policy if exists feedback_images_authenticated_insert on storage.objects;
create policy feedback_images_authenticated_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-images');

drop policy if exists feedback_images_authenticated_update on storage.objects;
create policy feedback_images_authenticated_update
  on storage.objects for update to authenticated
  using (bucket_id = 'feedback-images')
  with check (bucket_id = 'feedback-images');

drop policy if exists feedback_images_authenticated_delete on storage.objects;
create policy feedback_images_authenticated_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'feedback-images');

drop policy if exists feedback_images_valid_public_upload on storage.objects;
create policy feedback_images_valid_public_upload
  on storage.objects for insert to anon
  with check (
    bucket_id = 'feedback-images'
    and public.is_valid_feedback_upload(name)
  );

-- The only anonymous database write path. It resolves the product from the
-- secure token and never accepts a product id, source, or internal note from
-- the browser.
create or replace function public.submit_product_feedback(
  p_token text,
  p_feedback_id uuid,
  p_customer_name text,
  p_feedback_text text,
  p_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.feedback_links;
  clean_name text := nullif(btrim(p_customer_name), '');
  clean_text text := nullif(btrim(p_feedback_text), '');
  clean_path text := nullif(btrim(p_image_path), '');
  expected_path text;
begin
  select * into link
  from public.feedback_links
  where feedback_links.token = p_token
    and feedback_links.is_active
    and (feedback_links.expires_at is null or feedback_links.expires_at > now())
  for update;

  if not found then
    raise exception 'This feedback link is invalid or inactive.' using errcode = '22023';
  end if;
  if clean_text is null and clean_path is null then
    raise exception 'A feedback message or image is required.' using errcode = '23514';
  end if;

  if clean_path is not null then
    expected_path := 'submissions/' || p_token || '/' || p_feedback_id::text || '/image.webp';
    if clean_path <> expected_path or not exists (
      select 1 from storage.objects
      where bucket_id = 'feedback-images' and name = clean_path
    ) then
      raise exception 'The feedback image upload is not valid.' using errcode = '22023';
    end if;
  end if;

  insert into public.product_feedback(
    id, product_id, customer_name, feedback_text, image_path,
    source, internal_note, feedback_link_id, feedback_date
  ) values (
    p_feedback_id, link.product_id, clean_name, clean_text, clean_path,
    'customer_link', null, link.id, current_date
  );

  update public.feedback_links
  set submission_count = submission_count + 1
  where feedback_links.id = link.id;

  return p_feedback_id;
end;
$$;

revoke all on function public.feedback_product_exists(text) from public, anon, authenticated;
revoke all on function public.enforce_feedback_product() from public, anon, authenticated;
revoke all on function public.generate_feedback_link(text, timestamptz) from public, anon;
grant execute on function public.generate_feedback_link(text, timestamptz) to authenticated;
revoke all on function public.get_feedback_product(text) from public;
grant execute on function public.get_feedback_product(text) to anon, authenticated;
revoke all on function public.is_valid_feedback_upload(text) from public;
grant execute on function public.is_valid_feedback_upload(text) to anon, authenticated;
revoke all on function public.submit_product_feedback(text, uuid, text, text, text) from public;
grant execute on function public.submit_product_feedback(text, uuid, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

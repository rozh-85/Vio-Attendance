-- Vio product feedback galleries
--
-- Run after schema.sql and catalog.sql. Products remain in the single Master
-- Catalog. Administrators add feedback screenshots; public product links are
-- read-only galleries and never accept customer submissions.

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
-- Its password remains only in Supabase Auth and is never stored in this app.
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

-- Feedback managers can read product names/images from the Master Catalog but
-- cannot directly rewrite the catalog or inspect catalog drafts.
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

-- Master products are stored as one JSON document, so these guards provide the
-- same product-existence protection that a normal foreign key would provide.
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

-- Add a lightweight product from Feedback without opening Catalog Management.
-- The RPC is the only Master Catalog write available to the feedback account.
create or replace function public.add_feedback_product(
  p_name text,
  p_sku text,
  p_main_image text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := nullif(btrim(p_name), '');
  clean_sku text := nullif(btrim(p_sku), '');
  clean_image text := coalesce(nullif(btrim(p_main_image), ''), '');
  category_id constant text := 'cat-feedback-products';
  current_categories jsonb;
  current_products jsonb;
  created_product jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if clean_name is null or clean_sku is null then
    raise exception 'Product name and model / SKU are required.' using errcode = '23514';
  end if;

  insert into public.vio_catalog_master(id, categories, products)
  values ('default', '[]'::jsonb, '[]'::jsonb)
  on conflict (id) do nothing;

  select master.categories, master.products
    into current_categories, current_products
  from public.vio_catalog_master as master
  where master.id = 'default'
  for update;

  if exists (
    select 1
    from jsonb_array_elements(current_products) as product
    where lower(btrim(product ->> 'sku')) = lower(clean_sku)
  ) then
    raise exception 'A product with this model / SKU already exists.' using errcode = '23505';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(current_categories) as category
    where category ->> 'id' = category_id
  ) then
    current_categories := current_categories || jsonb_build_array(jsonb_build_object(
      'id', category_id,
      'name', 'Feedback products',
      'sortOrder', jsonb_array_length(current_categories),
      'visible', true
    ));
  end if;

  created_product := jsonb_build_object(
    'id', 'feedback-' || replace(gen_random_uuid()::text, '-', ''),
    'name', clean_name,
    'sku', clean_sku,
    'categoryId', category_id,
    'mainImage', clean_image,
    'additionalImages', '[]'::jsonb,
    'capacity', '',
    'power', '',
    'warranty', '',
    'weight', '',
    'cbm', '',
    'ctnQuantity', '',
    'retailPrice', null,
    'wholesalePrice', null,
    'specifications', '{}'::jsonb,
    'status', 'active',
    'sortOrder', jsonb_array_length(current_products),
    'updatedAt', now()
  );

  update public.vio_catalog_master
  set categories = current_categories,
      products = current_products || jsonb_build_array(created_product),
      master_revision = master_revision + 1,
      updated_at = now()
  where id = 'default';

  return created_product;
end;
$$;

-- Rotate links on the server so tokens are unpredictable and only one active
-- gallery link remains for a product.
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
  values (
    p_product_id,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    p_expires_at
  )
  returning * into created;

  return query select created.id, created.product_id, created.token,
    created.is_active, created.created_at, created.expires_at,
    created.submission_count;
end;
$$;

-- Remove the previous customer-submission path when this migration is rerun.
-- Existing rows are preserved, but anonymous users can no longer upload or add
-- feedback.
drop policy if exists feedback_images_valid_public_upload on storage.objects;
drop function if exists public.submit_product_feedback(text, uuid, text, text, text);
drop function if exists public.get_feedback_product(text);
drop function if exists public.is_valid_feedback_upload(text);

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

-- Anonymous users can request a short-lived signed URL only for an image that
-- belongs to a product with an active gallery link. Direct table access remains
-- blocked, and the private bucket never exposes a permanent public image URL.
create or replace function public.can_read_feedback_image(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.product_feedback as feedback
    join public.feedback_links as link on link.product_id = feedback.product_id
    where feedback.image_path = p_object_name
      and link.is_active
      and (link.expires_at is null or link.expires_at > now())
  );
$$;

drop policy if exists feedback_images_gallery_read on storage.objects;
create policy feedback_images_gallery_read
  on storage.objects for select to anon
  using (
    bucket_id = 'feedback-images'
    and public.can_read_feedback_image(name)
  );

-- A public token resolves to exactly one product and its manually-added image
-- rows. No product id, feedback table access, or write capability is exposed.
create or replace function public.get_feedback_gallery(p_token text)
returns table (
  product_name text,
  product_image text,
  feedback_id uuid,
  image_path text,
  feedback_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    product ->> 'name' as product_name,
    coalesce(product ->> 'mainImage', '') as product_image,
    feedback.id as feedback_id,
    feedback.image_path as image_path,
    feedback.feedback_date as feedback_date
  from public.feedback_links as link
  join public.vio_catalog_master as master on master.id = 'default'
  cross join lateral jsonb_array_elements(master.products) as product
  left join public.product_feedback as feedback
    on feedback.product_id = link.product_id
   and nullif(btrim(feedback.image_path), '') is not null
  where link.token = p_token
    and link.is_active
    and (link.expires_at is null or link.expires_at > now())
    and product ->> 'id' = link.product_id
  order by feedback.feedback_date desc nulls last, feedback.created_at desc nulls last;
$$;

revoke all on function public.feedback_product_exists(text) from public, anon, authenticated;
revoke all on function public.enforce_feedback_product() from public, anon, authenticated;
revoke all on function public.add_feedback_product(text, text, text) from public, anon;
grant execute on function public.add_feedback_product(text, text, text) to authenticated;
revoke all on function public.generate_feedback_link(text, timestamptz) from public, anon;
grant execute on function public.generate_feedback_link(text, timestamptz) to authenticated;
revoke all on function public.can_read_feedback_image(text) from public;
grant execute on function public.can_read_feedback_image(text) to anon, authenticated;
revoke all on function public.get_feedback_gallery(text) from public;
grant execute on function public.get_feedback_gallery(text) to anon, authenticated;

notify pgrst, 'reload schema';

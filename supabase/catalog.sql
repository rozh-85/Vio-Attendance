-- Vio Catalog Management
--
-- Run after schema.sql. Catalog products are stored once in the Master Catalog.
-- Each draft stores a complete JSON snapshot so later Master edits cannot
-- rewrite a previously created catalog.

create table if not exists public.vio_catalog_master (
  id              text primary key,
  categories      jsonb not null default '[]'::jsonb,
  products        jsonb not null default '[]'::jsonb,
  master_revision integer not null default 0,
  updated_at      timestamptz not null default now()
);

create table if not exists public.vio_catalog_drafts (
  id         text primary key,
  revision   integer not null default 0,
  document   jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vio_catalog_master enable row level security;
alter table public.vio_catalog_drafts enable row level security;

drop policy if exists vio_catalog_master_authenticated on public.vio_catalog_master;
create policy vio_catalog_master_authenticated
  on public.vio_catalog_master for all
  to authenticated
  using (true) with check (true);

drop policy if exists vio_catalog_drafts_authenticated on public.vio_catalog_drafts;
create policy vio_catalog_drafts_authenticated
  on public.vio_catalog_drafts for all
  to authenticated
  using (true) with check (true);

create index if not exists vio_catalog_drafts_updated_at_idx
  on public.vio_catalog_drafts(updated_at desc);

notify pgrst, 'reload schema';

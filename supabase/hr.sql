-- Vio HR workspace persistence and private document storage.
-- Run after schema.sql as the authenticated HR administrator.

create or replace function public.is_feedback_manager()
returns boolean language sql stable set search_path = ''
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) = 'feedback@gmail.com' $$;

create table if not exists public.vio_hr_workspace (
  id text primary key,
  document jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

insert into public.vio_hr_workspace (id, document, revision)
values ('default', '{}'::jsonb, 0)
on conflict (id) do nothing;

alter table public.vio_hr_workspace enable row level security;
drop policy if exists hr_workspace_authenticated on public.vio_hr_workspace;
create policy hr_workspace_authenticated on public.vio_hr_workspace
  for all to authenticated using (not public.is_feedback_manager())
  with check (not public.is_feedback_manager());
grant select, insert, update on public.vio_hr_workspace to authenticated;

create or replace function public.save_hr_workspace(p_document jsonb, p_revision bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare next_revision bigint;
begin
  if coalesce(lower(auth.jwt() ->> 'email'), '') = 'feedback@gmail.com' then
    raise exception 'HR_ACCESS_DENIED';
  end if;
  update public.vio_hr_workspace
     set document = p_document,
         revision = revision + 1,
         updated_at = now()
   where id = 'default'
     and revision = p_revision
   returning revision into next_revision;
  if next_revision is null then raise exception 'HR_REVISION_CONFLICT'; end if;
  return next_revision;
end;
$$;
revoke all on function public.save_hr_workspace(jsonb, bigint) from public, anon;
grant execute on function public.save_hr_workspace(jsonb, bigint) to authenticated;

insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', false)
on conflict (id) do nothing;

drop policy if exists hr_documents_read on storage.objects;
create policy hr_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'hr-documents' and not public.is_feedback_manager());
drop policy if exists hr_documents_write on storage.objects;
create policy hr_documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-documents' and not public.is_feedback_manager());
drop policy if exists hr_documents_delete on storage.objects;
create policy hr_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hr-documents' and not public.is_feedback_manager());

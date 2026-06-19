-- SOLUÇÃO DEFINITIVA: Garante que o usuário possa ver projetos onde foi adicionado
-- como membro, mesmo em situações de cache/race condition do RLS

-- 1. Recria a função com SECURITY DEFINER para bypassar RLS na checagem
create or replace function public.is_project_member(p_project_id bigint, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_members where project_id = p_project_id and user_id = p_user_id
  ) or exists (
    select 1 from public.projects where id = p_project_id and owner_id = p_user_id
  );
$$ language sql stable security definer set search_path = public;

-- 2. Remove TODAS as policies de SELECT existentes em projects
drop policy if exists "Users can view their own projects" on public.projects;
drop policy if exists "Users can view their own projects or shared" on public.projects;
drop policy if exists "Users can view projects they own or are members of" on public.projects;
drop policy if exists "projects_select_owner_or_member" on public.projects;
drop policy if exists "projects_select" on public.projects;

-- 3. Cria a policy de SELECT usando a função SECURITY DEFINER
-- A função bypassa RLS, então sempre terá dados atualizados
create policy "projects_select_via_helper" on public.projects
  for select using (
    auth.uid() = owner_id
    or public.is_project_member(id, auth.uid())
  );

-- 4. Garante índices para performance
create index if not exists idx_project_members_user_id on public.project_members(user_id);
create index if not exists idx_project_members_project_id on public.project_members(project_id);
create index if not exists idx_project_members_composite on public.project_members(user_id, project_id);
create index if not exists idx_projects_owner on public.projects(owner_id);
create index if not exists idx_projects_id on public.projects(id);

-- 5. Força reload do schema (PostgREST cache)
notify pgrst, 'reload schema';

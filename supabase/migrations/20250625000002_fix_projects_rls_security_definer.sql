-- Solução: usar SECURITY DEFINER na função de verificação e garantir
-- que a policy de SELECT na tabela projects funcione imediatamente após
-- a inserção em project_members

-- Recria a função de verificação de membership com SECURITY DEFINER
-- (bypassa RLS para checagem)
create or replace function public.is_project_member(p_project_id bigint, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_members where project_id = p_project_id and user_id = p_user_id
  ) or exists (
    select 1 from public.projects where id = p_project_id and owner_id = p_user_id
  );
$$ language sql stable security definer;

-- Garante que a policy de SELECT na tabela projects use a função helper
-- que é SECURITY DEFINER (bypassa RLS)
drop policy if exists "projects_select_owner_or_member" on public.projects;
create policy "projects_select_owner_or_member" on public.projects
  for select using (
    auth.uid() = owner_id
    or public.is_project_member(id, auth.uid())
  );

-- Garante que existe índice composto para melhorar performance
create index if not exists idx_project_members_composite on public.project_members(user_id, project_id);
create index if not exists idx_projects_owner on public.projects(owner_id);

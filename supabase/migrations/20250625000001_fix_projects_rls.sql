-- Garante que o usuário possa ver projetos onde é membro, inclusive logo após aceitar convite
-- Remove políticas antigas e recria de forma mais robusta

-- Remove todas as policies existentes da tabela projects
drop policy if exists "Users can view their own projects" on public.projects;
drop policy if exists "Users can view their own projects or shared" on public.projects;
drop policy if exists "Users can view projects they own or are members of" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can update their own projects or shared" on public.projects;
drop policy if exists "Project owners can update" on public.projects;
drop policy if exists "Users can insert their own projects" on public.projects;
drop policy if exists "Users can insert projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;
drop policy if exists "Project owners can delete" on public.projects;

-- SELECT: usuário pode ver projetos onde é dono OU membro
create policy "projects_select_owner_or_member" on public.projects
  for select using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = projects.id
      and pm.user_id = auth.uid()
    )
  );

-- INSERT: apenas o dono pode criar
create policy "projects_insert_owner" on public.projects
  for insert with check (auth.uid() = owner_id);

-- UPDATE: apenas o dono pode atualizar
create policy "projects_update_owner" on public.projects
  for update using (auth.uid() = owner_id);

-- DELETE: apenas o dono pode deletar
create policy "projects_delete_owner" on public.projects
  for delete using (auth.uid() = owner_id);

-- Garante que a função is_project_member está otimizada
create or replace function public.is_project_member(p_project_id bigint, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_members where project_id = p_project_id and user_id = p_user_id
  ) or exists (
    select 1 from public.projects where id = p_project_id and owner_id = p_user_id
  );
$$ language sql stable security definer;

-- Adiciona índice para melhorar performance da query de membros
create index if not exists idx_project_members_user_id on public.project_members(user_id);
create index if not exists idx_project_members_project_id on public.project_members(project_id);

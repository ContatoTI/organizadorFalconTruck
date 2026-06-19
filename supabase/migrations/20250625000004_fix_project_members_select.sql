-- Garante que o usuário SEMPRE possa ver seus próprios memberships
-- (necessário para a query de projetos funcionar após aceitar convite)

-- Remove policies antigas
drop policy if exists "Users can view project members" on public.project_members;
drop policy if exists "project_members_select" on public.project_members;
drop policy if exists "project_members_select_own" on public.project_members;
drop policy if exists "project_members_select_owner_or_member" on public.project_members;

-- Policy simplificada e robusta: usuário vê seus próprios memberships
create policy "project_members_select_own" on public.project_members
  for select using (auth.uid() = user_id);

-- Policy: dono do projeto vê todos os membros
create policy "project_members_select_owner" on public.project_members
  for select using (
    exists (
      select 1 from public.projects 
      where id = project_members.project_id 
      and owner_id = auth.uid()
    )
  );

-- Policy: outros membros veem os demais membros do mesmo projeto
create policy "project_members_select_other_members" on public.project_members
  for select using (
    public.is_project_member(project_id, auth.uid())
  );

-- Garante que a função is_project_member seja acessível
grant execute on function public.is_project_member(bigint, uuid) to authenticated;
grant execute on function public.is_project_member(bigint, uuid) to anon;

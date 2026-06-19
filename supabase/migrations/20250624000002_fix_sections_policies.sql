-- Permitir que membros de um projeto criem, atualizem e deletem seções vinculadas ao projeto
create policy "Project members can view sections" on public.sections
  for select using (
    auth.uid() = user_id or
    public.is_project_member(project_id, auth.uid())
  );

create policy "Project members can insert sections" on public.sections
  for insert with check (
    auth.uid() = user_id or
    public.is_project_member(project_id, auth.uid())
  );

create policy "Project members can update sections" on public.sections
  for update using (
    auth.uid() = user_id or
    public.is_project_member(project_id, auth.uid())
  );

create policy "Project members can delete sections" on public.sections
  for delete using (
    auth.uid() = user_id or
    public.is_project_member(project_id, auth.uid())
  );

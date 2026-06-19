-- Permitir que membros de um projeto criem, atualizem e deletem tarefas (todos) vinculadas ao projeto
create policy "Project members can insert tasks" on public.todos
  for insert with check (
    auth.uid() = user_id or
    (project_id is not null and public.is_project_member(project_id, auth.uid()))
  );

create policy "Project members can view tasks" on public.todos
  for select using (
    auth.uid() = user_id or
    (project_id is not null and public.is_project_member(project_id, auth.uid()))
  );

create policy "Project members can update tasks" on public.todos
  for update using (
    auth.uid() = user_id or
    (project_id is not null and public.is_project_member(project_id, auth.uid()))
  );

create policy "Project members can delete tasks" on public.todos
  for delete using (
    auth.uid() = user_id or
    (project_id is not null and public.is_project_member(project_id, auth.uid()))
  );

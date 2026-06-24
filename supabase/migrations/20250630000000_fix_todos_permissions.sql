-- Remove as policies antigas restritivas
drop policy if exists "Project members can update tasks" on public.todos;
drop policy if exists "Project members can delete tasks" on public.todos;
drop policy if exists "Users can update their own tasks" on public.todos;
drop policy if exists "Users can delete their own tasks" on public.todos;

-- UPDATE: Qualquer membro do projeto pode atualizar tarefas (riscar, mudar titulo, etc)
create policy "Project members can update tasks" on public.todos
  for update using (
    auth.uid() = user_id or
    (project_id is not null and public.is_project_member(project_id, auth.uid()))
  );

-- DELETE: Qualquer membro do projeto pode excluir tarefas
create policy "Project members can delete tasks" on public.todos
  for delete using (
    auth.uid() = user_id or
    (project_id is not null and public.is_project_member(project_id, auth.uid()))
  );

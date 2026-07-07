-- Membros de projeto (não-donos) só veem tarefas que criaram ou que foram atribuídas a eles.
-- Donos do projeto continuam vendo todas as tarefas do seu projeto.

drop policy if exists "Project members can view tasks" on public.todos;
create policy "Project members can view tasks" on public.todos
  for select using (
    auth.uid() = user_id
    or assignee_id = auth.uid()
    or (project_id is not null and exists (
      select 1 from public.projects where id = project_id and owner_id = auth.uid()
    ))
    or (section_id is not null and public.is_section_shared(section_id, auth.uid()))
    or public.is_task_shared(id, auth.uid())
  );

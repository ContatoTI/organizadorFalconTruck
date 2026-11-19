-- Membros de projeto passam a ver TODAS as tarefas do projeto (antes: só as
-- que criaram ou que foram atribuídas a eles). Só leitura: edição não muda.
-- Tarefas pessoais (sem projeto) continuam privadas.

drop policy if exists "Project members can view tasks" on public.todos;
create policy "Project members can view tasks" on public.todos
  for select using (
    auth.uid() = user_id
    or assignee_id = auth.uid()
    or (project_id is not null and exists (
      select 1 from public.projects where id = project_id and owner_id = auth.uid()
    ))
    or (project_id is not null and public.is_project_member(project_id, auth.uid()))
    or (section_id is not null and public.is_section_shared(section_id, auth.uid()))
    or public.is_task_shared(id, auth.uid())
  );

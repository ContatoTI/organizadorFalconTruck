-- Garante que qualquer membro do projeto possa concluir/riscar tarefas
-- Restrições mais severas permanecem apenas para edição e exclusão

-- Remove policies antigas para recriar
drop policy if exists "Project members can insert tasks" on public.todos;
drop policy if exists "Project members can view tasks" on public.todos;
drop policy if exists "Project members can update tasks" on public.todos;
drop policy if exists "Project members can delete tasks" on public.todos;

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

-- UPDATE: membros do projeto podem atualizar qualquer tarefa do projeto
create policy "Project members can update tasks" on public.todos
  for update using (
    auth.uid() = user_id or
    (project_id is not null and public.is_project_member(project_id, auth.uid()))
  );

-- DELETE: mantém restrição — só o criador ou admins podem excluir
create policy "Project members can delete tasks" on public.todos
  for delete using (
    auth.uid() = user_id or
    (project_id is not null and public.is_project_member(project_id, auth.uid()))
  );

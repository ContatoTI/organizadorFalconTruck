-- Compartilhamento de tarefa via atribuição: um usuário que não é dono nem
-- membro do projeto, mas tem uma tarefa atribuída a ele (assignee_id), passa
-- a enxergar o projeto na sua lista — porém o RLS de todos/sections/members
-- já garante que ele só vê as próprias tarefas atribuídas, nada mais.

create or replace function public.has_project_access(p_project_id bigint, p_user_id uuid)
returns boolean as $$
  select
    public.is_project_member(p_project_id, p_user_id)
    or exists (
      select 1 from public.sections s
      where s.project_id = p_project_id and public.is_section_shared(s.id, p_user_id)
    )
    or exists (
      select 1 from public.todos t
      where t.project_id = p_project_id and public.is_task_shared(t.id, p_user_id)
    )
    or exists (
      select 1 from public.todos t
      where t.project_id = p_project_id and t.assignee_id = p_user_id
    );
$$ language sql stable security definer;

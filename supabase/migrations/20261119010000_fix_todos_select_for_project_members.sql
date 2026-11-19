-- Corrige: membro do projeto não via as tarefas do projeto.
-- Deixa UMA regra de leitura em todos (fonte única), sem depender de regras
-- antigas que possam estar sobrando no banco (inclusive restritivas).
-- Pode rodar mais de uma vez.

-- 1) Função própria e simples: é dono OU membro do projeto?
--    security definer = não esbarra nas regras de project_members/projects.
create or replace function public.participa_do_projeto(p_project_id bigint, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.projects where id = p_project_id and owner_id = p_user_id)
      or exists (select 1 from public.project_members where project_id = p_project_id and user_id = p_user_id);
$$;

grant execute on function public.participa_do_projeto(bigint, uuid) to authenticated;

-- 2) Remove TODAS as regras só de leitura (SELECT) de todos.
--    Regras de criar/editar/excluir não são tocadas.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'todos' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.todos', r.policyname);
  end loop;
end $$;

-- 3) Regra única de leitura.
create policy "todos_select_visiveis" on public.todos
  for select using (
    auth.uid() = user_id
    or assignee_id = auth.uid()
    or (project_id is not null and public.participa_do_projeto(project_id, auth.uid()))
    or (section_id is not null and public.is_section_shared(section_id, auth.uid()))
    or public.is_task_shared(id, auth.uid())
  );

-- 4) Conferência: em SELECT deve sobrar só "todos_select_visiveis".
--    Se aparecer alguma linha RESTRICTIVE (permissive = RESTRICTIVE), me avise.
select policyname, cmd, permissive from pg_policies
where schemaname = 'public' and tablename = 'todos' and cmd in ('SELECT', 'ALL');

-- Regra: quem é dono ou membro do projeto vê TODAS as tarefas do projeto,
-- sem exceção (não importa quem criou, quem é responsável ou a pasta).
-- Pode rodar mais de uma vez.

-- 1) Dono OU membro do projeto (security definer = ignora RLS de projects/project_members).
create or replace function public.participa_do_projeto(p_project_id bigint, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.projects where id = p_project_id and owner_id = p_user_id)
      or exists (select 1 from public.project_members where project_id = p_project_id and user_id = p_user_id);
$$;

grant execute on function public.participa_do_projeto(bigint, uuid) to authenticated;

-- 2) Remove todas as regras de LEITURA de todos e qualquer regra RESTRITIVA
--    (restritiva barra mesmo quando outra regra libera).
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'todos'
      and (cmd = 'SELECT' or permissive = 'RESTRICTIVE')
  loop
    execute format('drop policy if exists %I on public.todos', r.policyname);
  end loop;
end $$;

-- 3) Regra única de leitura.
create policy "todos_select_visiveis" on public.todos
  for select to authenticated using (
    auth.uid() = user_id
    or assignee_id = auth.uid()
    or (project_id is not null and public.participa_do_projeto(project_id, auth.uid()))
    or (section_id is not null and public.is_section_shared(section_id, auth.uid()))
    or public.is_task_shared(id, auth.uid())
  );

-- 4) Conferência das regras que ficaram (não deve haver RESTRICTIVE).
select policyname, cmd, permissive from pg_policies
where schemaname = 'public' and tablename = 'todos'
order by cmd;

-- 5) Conferência dos membros: cada membro deve aparecer aqui com o projeto.
--    Se o membro NÃO aparecer, ele não está em project_members (só convidado) — me avise.
select p.name as projeto, pm.user_id, u.email
from public.project_members pm
join public.projects p on p.id = pm.project_id
left join auth.users u on u.id = pm.user_id
order by p.name;

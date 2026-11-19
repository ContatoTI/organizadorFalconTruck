-- Convites pendentes do usuário logado, já com nome e cor do projeto.
--
-- Por quê: o convidado ainda não é membro, então as regras de leitura de "projects"
-- (inclusive regras extras que existem só no banco de produção) escondem o projeto
-- e a tela mostrava "Convite para Projeto". Esta função lê com permissão do banco,
-- mas devolve SOMENTE os convites pendentes de quem está logado (auth.uid()).
-- Não altera nenhuma regra nem dado existente. Pode rodar mais de uma vez.

create or replace function public.my_pending_project_invites()
returns table (
  id bigint,
  project_id bigint,
  invited_by_user_id uuid,
  created_at timestamptz,
  project_name text,
  project_color text
)
language sql stable security definer set search_path = public
as $$
  select i.id, i.project_id, i.invited_by_user_id, i.created_at, p.name, p.color
  from public.project_invites i
  left join public.projects p on p.id = i.project_id
  where i.invited_user_id = auth.uid()
    and i.status = 'pending'
  order by i.created_at desc;
$$;

revoke all on function public.my_pending_project_invites() from public, anon;
grant execute on function public.my_pending_project_invites() to authenticated;

notify pgrst, 'reload schema';

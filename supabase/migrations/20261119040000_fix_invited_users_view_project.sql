-- Corrige a policy "Invited users can view project".
-- Bug: dentro do subselect, "id" apontava para project_invites.id (o convite),
-- não para projects.id. Resultado: o convidado não conseguia ler o projeto e a
-- tela mostrava "Projeto" com a cor padrão no lugar do nome real.
-- Convites já existentes passam a mostrar o nome sem precisar mexer nos dados.
--
-- A checagem fica numa função SECURITY DEFINER (mesmo padrão de is_project_member)
-- para não entrar em loop: as policies de project_invites também consultam projects.

create or replace function public.has_pending_project_invite(p_project_id bigint, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_invites
    where project_id = p_project_id
      and invited_user_id = p_user_id
      and status = 'pending'
  );
$$ language sql stable security definer set search_path = public;

drop policy if exists "Invited users can view project" on public.projects;

create policy "Invited users can view project" on public.projects
  for select using (
    public.has_pending_project_invite(id, auth.uid())
  );

notify pgrst, 'reload schema';

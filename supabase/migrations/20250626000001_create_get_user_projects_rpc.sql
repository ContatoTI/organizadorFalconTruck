-- FunÃ§Ã£o RPC que retorna projetos do usuÃ¡rio (prÃ³prios + membro)
-- SECURITY DEFINER: bypassa RLS completamente
-- Resolve o problema de cache RLS que impedia projetos recÃ©m-aceitos de aparecerem

create or replace function public.get_user_projects(p_user_id uuid)
returns setof public.projects
language sql
stable
security definer
set search_path = public
as $$
  select p.* from public.projects p
  where p.owner_id = p_user_id
  or exists (
    select 1 from public.project_members pm
    where pm.project_id = p.id and pm.user_id = p_user_id
  );
$$;

grant execute on function public.get_user_projects(uuid) to authenticated;
grant execute on function public.get_user_projects(uuid) to anon;

notify pgrst, 'reload schema';

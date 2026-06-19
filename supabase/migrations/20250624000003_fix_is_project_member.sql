-- Atualizar a função helper para considerar o dono do projeto também como membro/acessante
create or replace function public.is_project_member(p_project_id bigint, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_members where project_id = p_project_id and user_id = p_user_id
  ) or exists (
    select 1 from public.projects where id = p_project_id and owner_id = p_user_id
  );
$$ language sql stable security definer;

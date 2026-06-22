-- Permite que usuÃ¡rios convidados vejam dados do projeto (nome, cor)
-- para exibir corretamente nas notificaÃ§Ãµes de convite.
-- ApÃ³s aceitar, o usuÃ¡rio se torna membro e a policy existente cobre.

drop policy if exists "Invited users can view project" on public.projects;

create policy "Invited users can view project" on public.projects
  for select using (
    exists (
      select 1 from public.project_invites
      where project_id = id
      and invited_user_id = auth.uid()
      and status = 'pending'
    )
  );

-- Garante reload do schema PostgREST
notify pgrst, 'reload schema';

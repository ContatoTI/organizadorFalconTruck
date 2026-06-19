-- Permite que usuários convidados se adicionem aos membros do projeto caso tenham um convite aceito ou pendente
create policy "Invited users can insert themselves" on public.project_members
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.project_invites
      where project_id = project_members.project_id
        and invited_user_id = auth.uid()
        and status in ('pending', 'accepted')
    )
  );

-- Garantir que convidados também possam ver tarefas do projeto, caso não esteja coberto
-- (Normalmente, se já inseriu em project_members, a policy de tasks que olha para project_members resolve,
-- mas precisamos checar se a política de tasks permite criar/atualizar/deletar).

-- Somente o dono do projeto pode atribuir/reatribuir uma tarefa a alguém.
-- A policy de UPDATE de todos permite que qualquer membro do projeto edite a
-- linha (título, status, etc.), então a restrição de quem pode mudar
-- assignee_id precisa ser feita via trigger (RLS não enxerga o valor antigo
-- coluna a coluna).

create or replace function public.restrict_assignee_change()
returns trigger as $$
begin
  if new.assignee_id is distinct from old.assignee_id then
    if new.project_id is not null and not exists (
      select 1 from public.projects where id = new.project_id and owner_id = auth.uid()
    ) then
      raise exception 'Apenas o proprietário do projeto pode atribuir esta tarefa.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_restrict_assignee_change on public.todos;
create trigger trg_restrict_assignee_change
  before update on public.todos
  for each row execute function public.restrict_assignee_change();

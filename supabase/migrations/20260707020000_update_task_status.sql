-- Atualiza status das tarefas: adiciona REVISAO e padroniza nomes
do $$
begin
  -- Remove a constraint antiga (nome pode variar, tenta ambos)
  if exists (
    select 1 from pg_constraint where conname = 'todos_status_check'
  ) then
    alter table public.todos drop constraint todos_status_check;
  end if;
  if exists (
    select 1 from pg_constraint where conname = 'todos_status_check1'
  ) then
    alter table public.todos drop constraint todos_status_check1;
  end if;
end $$;

-- Migra dados existentes
update public.todos set status = 'A_FAZER' where status = 'a_fazer';
update public.todos set status = 'EM_ANDAMENTO' where status = 'em_andamento';
update public.todos set status = 'CONCLUIDO' where status = 'concluida';

-- Atualiza o default
alter table public.todos alter column status set default 'A_FAZER';

-- Adiciona nova constraint com REVISAO
alter table public.todos add constraint todos_status_check
  check (status in ('A_FAZER', 'EM_ANDAMENTO', 'REVISAO', 'CONCLUIDO'));

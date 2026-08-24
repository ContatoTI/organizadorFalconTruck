-- Controle de tempo sem alteração de status: tarefas que ficam em A_FAZER / EM_ANDAMENTO
-- por mais de 1 dia são movidas automaticamente para REVISAO com a etiqueta
-- "Não concluída - Remanejar" para sinalizar que precisam de ação.

alter table public.todos
  add column if not exists status_changed_at timestamp with time zone default now();

alter table public.todos
  add column if not exists auto_review_reason text;

-- Backfill das tarefas existentes: usa created_at como referência inicial.
update public.todos
  set status_changed_at = coalesce(created_at, now())
  where status_changed_at is null;

create index if not exists todos_status_changed_at_idx
  on public.todos (status_changed_at);

comment on column public.todos.status_changed_at is
  'Última vez que o status da tarefa foi alterado (manual ou automaticamente). Usado para detectar tarefas paradas há mais de 1 dia.';

comment on column public.todos.auto_review_reason is
  'Quando não nulo, indica que a tarefa foi movida automaticamente para REVISAO por inatividade. Limpa quando o usuário altera o status manualmente.';

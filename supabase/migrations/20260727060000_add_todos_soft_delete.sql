-- Soft delete para tarefas: em vez de apagar a linha na hora, marcamos deleted_at
-- e a tarefa passa a viver na "Lixeira" até ser restaurada ou excluída definitivamente.

alter table public.todos add column if not exists deleted_at timestamp with time zone;

create index if not exists todos_deleted_at_idx on public.todos (deleted_at);

comment on column public.todos.deleted_at is 'Quando não nulo, a tarefa está na lixeira (soft delete) e não deve aparecer nas listagens normais.';

-- Anexos (imagens) das tarefas. O arquivo fica no Google Drive; aqui só o vínculo.
-- Quem enxerga a tarefa (RLS de public.todos) pode listar, anexar e excluir.
-- Exclusão é lógica (excluido_em); o arquivo vai para a lixeira do Drive.

create table if not exists public.tarefa_anexos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id bigint not null references public.todos(id) on delete cascade,
  drive_file_id text not null,
  nome text not null,
  mime text not null,
  tamanho integer not null check (tamanho > 0),
  criado_por uuid not null default auth.uid() references auth.users(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz
);

create index if not exists idx_tarefa_anexos_tarefa
  on public.tarefa_anexos (tarefa_id) where excluido_em is null;

alter table public.tarefa_anexos enable row level security;

-- O subselect em todos respeita a RLS de todos: só passa se o usuário vê a tarefa.
create policy tarefa_anexos_select on public.tarefa_anexos
  for select using (
    exists (select 1 from public.todos t where t.id = tarefa_id)
  );

create policy tarefa_anexos_insert on public.tarefa_anexos
  for insert with check (
    criado_por = auth.uid()
    and exists (select 1 from public.todos t where t.id = tarefa_id)
  );

-- Update só serve para marcar excluido_em.
create policy tarefa_anexos_update on public.tarefa_anexos
  for update using (
    exists (select 1 from public.todos t where t.id = tarefa_id)
  );

-- Adiciona coluna position na tabela todos para ordenação customizada
alter table public.todos
  add column if not exists position integer not null default 0;

-- Índice para performance em ordenações
create index if not exists idx_todos_position on public.todos(project_id, position desc);
create index if not exists idx_todos_section_position on public.todos(section_id, position desc);
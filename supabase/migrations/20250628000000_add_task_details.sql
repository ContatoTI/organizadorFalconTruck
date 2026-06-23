-- Adiciona colunas description, priority e status na tabela todos
alter table public.todos
  add column if not exists description text,
  add column if not exists priority text check (priority in ('baixa', 'media', 'alta', 'urgente')),
  add column if not exists status text check (status in ('a_fazer', 'em_andamento', 'concluida')) default 'a_fazer';

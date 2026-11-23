-- Ordem manual dos grupos (só organização). Nulo = vai para o fim, por data de criação.
alter table public.view_groups add column if not exists position integer;

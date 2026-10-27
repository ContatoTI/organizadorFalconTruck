-- Desfaz 20261027000000_create_tarefa_anexos.sql
-- Atenção: apaga os vínculos. Os arquivos no Google Drive NÃO são removidos.

drop policy if exists tarefa_anexos_update on public.tarefa_anexos;
drop policy if exists tarefa_anexos_insert on public.tarefa_anexos;
drop policy if exists tarefa_anexos_select on public.tarefa_anexos;
drop index if exists public.idx_tarefa_anexos_tarefa;
drop table if exists public.tarefa_anexos;

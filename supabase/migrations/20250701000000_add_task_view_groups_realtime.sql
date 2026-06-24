-- Adiciona task_view_groups à publicação do Supabase Realtime
-- para que mudanças nos vínculos tarefa-grupo sejam propagadas em tempo real
alter publication supabase_realtime add table public.task_view_groups;

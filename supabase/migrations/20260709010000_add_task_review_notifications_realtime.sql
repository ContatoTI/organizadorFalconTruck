-- Adiciona task_review_notifications à publicação do Supabase Realtime
-- para que o sino de notificações atualize em tempo real ao atribuir tarefas.
alter publication supabase_realtime add table public.task_review_notifications;

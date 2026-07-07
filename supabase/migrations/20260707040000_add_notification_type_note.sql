-- Adiciona type e note às notificações de tarefa
alter table public.task_review_notifications
  add column if not exists type text default 'review' check (type in ('review', 'approved', 'rejected')),
  add column if not exists note text;

-- Atualiza notificações existentes para o tipo 'review'
update public.task_review_notifications set type = 'review' where type is null;

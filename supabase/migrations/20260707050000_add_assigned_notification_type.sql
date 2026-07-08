-- Permite o tipo 'assigned' (tarefa atribuída) nas notificações de tarefa
alter table public.task_review_notifications
  drop constraint if exists task_review_notifications_type_check;

alter table public.task_review_notifications
  add constraint task_review_notifications_type_check
  check (type in ('review', 'approved', 'rejected', 'assigned'));

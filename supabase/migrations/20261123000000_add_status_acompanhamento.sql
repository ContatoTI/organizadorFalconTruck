-- Novo status 'ACOMPANHAMENTO': tarefa em que a pessoa precisa de ajuda/acompanhamento.
ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_status_check;

ALTER TABLE public.todos
  ADD CONSTRAINT todos_status_check
  CHECK (status IN ('A_FAZER', 'EM_ANDAMENTO', 'REVISAO', 'CONCLUIDO', 'AGUARDANDO', 'ACOMPANHAMENTO'));

-- 'ACOMPANHAMENTO' é um status novo; o CHECK antigo precisa ser recriado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todos_status_check'
  ) THEN
    ALTER TABLE public.todos DROP CONSTRAINT todos_status_check;
  END IF;

  ALTER TABLE public.todos
    ADD CONSTRAINT todos_status_check
    CHECK (status IN ('A_FAZER', 'EM_ANDAMENTO', 'ACOMPANHAMENTO', 'REVISAO', 'CONCLUIDO', 'AGUARDANDO'));
END $$;

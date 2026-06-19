-- Garante que ao excluir um projeto, seção ou bloco/lista (view_group),
-- as tarefas associadas voltem para a "Caixa de Entrada" (sem associação),
-- em vez de serem apagadas em cascata.

-- 1) project_id -> projects
ALTER TABLE public.todos
  DROP CONSTRAINT IF EXISTS todos_project_id_fkey;

ALTER TABLE public.todos
  ADD CONSTRAINT todos_project_id_fkey
  FOREIGN KEY (project_id)
  REFERENCES public.projects(id)
  ON DELETE SET NULL;

-- 2) section_id -> sections
ALTER TABLE public.todos
  DROP CONSTRAINT IF EXISTS todos_section_id_fkey;

ALTER TABLE public.todos
  ADD CONSTRAINT todos_section_id_fkey
  FOREIGN KEY (section_id)
  REFERENCES public.sections(id)
  ON DELETE SET NULL;

-- 3) view_group_id -> view_groups
-- O nome da constraint pode variar dependendo de como foi criada originalmente.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.todos'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%view_group_id%REFERENCES public.view_groups%'
  LOOP
    EXECUTE format('ALTER TABLE public.todos DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.todos
  ADD CONSTRAINT todos_view_group_id_fkey
  FOREIGN KEY (view_group_id)
  REFERENCES public.view_groups(id)
  ON DELETE SET NULL;

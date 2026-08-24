-- ============================================================================
-- Redesign: Captura Rápida + Calendário por horário
-- ----------------------------------------------------------------------------
-- Seguro de rodar mais de uma vez (tudo IF NOT EXISTS).
-- Nada é apagado nem renomeado.
-- ============================================================================

-- 1) Duração da tarefa em minutos — usada pelo calendário estilo Google para
--    saber a altura do bloco. 30 min é o padrão de um evento rápido.
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS duration_min integer DEFAULT 30;

COMMENT ON COLUMN public.todos.duration_min IS
  'Duração em minutos usada pelo calendário. NULL/0 = tarefa sem horário (dia inteiro).';

-- 2) due_at (timestamptz) já existe no schema mas nunca foi usado pelo app.
--    A partir de agora ele é a fonte de verdade do "quando" com hora exata,
--    enquanto due_date continua sendo o "quando" só com o dia.
COMMENT ON COLUMN public.todos.due_at IS
  'Data + hora exata do agendamento (calendário). Quando NULL, use due_date (dia inteiro).';

-- 3) Backfill: tarefas que já tinham due_date mas não due_at ganham 09:00
--    para aparecerem no calendário sem virar "sem horário".
UPDATE public.todos
   SET due_at = (due_date::timestamp + time '09:00') AT TIME ZONE 'UTC'
 WHERE due_at IS NULL
   AND due_date IS NOT NULL
   AND deleted_at IS NULL;

-- 4) Índices para as duas consultas quentes do redesign:
--    a) faixa de datas do calendário
--    b) caixa de entrada (tarefa do usuário sem projeto, sem bloco, sem lista)
CREATE INDEX IF NOT EXISTS idx_todos_user_due_at
  ON public.todos (user_id, due_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_todos_inbox
  ON public.todos (user_id, "position")
  WHERE deleted_at IS NULL
    AND project_id IS NULL
    AND view_group_id IS NULL
    AND is_completed = false;

-- 5) As preferências do redesign (modo "Agora", último destino da captura)
--    ficam no JSONB public.user_preferences.preferences, que já existe.
--    Nada a alterar aqui — registrado só para documentar o contrato:
--      { "focus_mode": true, "last_capture_target": "inbox" | "group:12" | "project:3" }

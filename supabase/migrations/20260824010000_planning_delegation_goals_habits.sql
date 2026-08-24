-- ============================================================================
-- Planejamento por horizonte · Delegação · Objetivos em árvore · Hábitos
-- ----------------------------------------------------------------------------
-- Seguro de rodar mais de uma vez. Nada é apagado nem renomeado.
-- Rode DEPOIS de 20260824000000_redesign_capture_and_calendar.sql.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1) ADIAR POR HORIZONTE
--    "não quero pensar nisso agora": manda a tarefa para um dia, uma semana,
--    um mês ou um ano, e ela some da vista até aquele horizonte chegar.
--
--    plan_horizon = a granularidade escolhida
--    plan_date    = a âncora, sempre normalizada:
--                     day   -> o próprio dia
--                     week  -> a segunda-feira daquela semana
--                     month -> dia 1 do mês
--                     year  -> 1º de janeiro
--    A tarefa reaparece quando plan_date <= hoje.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS plan_horizon text,
  ADD COLUMN IF NOT EXISTS plan_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todos_plan_horizon_check'
  ) THEN
    ALTER TABLE public.todos
      ADD CONSTRAINT todos_plan_horizon_check
      CHECK (plan_horizon IS NULL OR plan_horizon IN ('day', 'week', 'month', 'year'));
  END IF;
END $$;

COMMENT ON COLUMN public.todos.plan_horizon IS
  'Granularidade do adiamento: day | week | month | year. NULL = está na vista de agora.';
COMMENT ON COLUMN public.todos.plan_date IS
  'Âncora normalizada do horizonte. A tarefa volta a aparecer quando plan_date <= hoje.';

CREATE INDEX IF NOT EXISTS idx_todos_plan
  ON public.todos (user_id, plan_date)
  WHERE deleted_at IS NULL AND plan_horizon IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- 2) DELEGAÇÃO
--    Passou para alguém: a tarefa sai da sua vista e vai para "Aguardando",
--    onde você só olha quando for cobrar.
--    Reaproveita assignee_id, que já existia. delegated_at responde
--    "há quanto tempo estou esperando isso?".
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS delegated_at timestamp with time zone;

COMMENT ON COLUMN public.todos.delegated_at IS
  'Quando a tarefa foi passada para outra pessoa. Alimenta o "esperando há N dias".';

-- 'AGUARDANDO' é um status novo; o CHECK antigo precisa ser recriado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todos_status_check'
  ) THEN
    ALTER TABLE public.todos DROP CONSTRAINT todos_status_check;
  END IF;

  ALTER TABLE public.todos
    ADD CONSTRAINT todos_status_check
    CHECK (status IN ('A_FAZER', 'EM_ANDAMENTO', 'REVISAO', 'CONCLUIDO', 'AGUARDANDO'));
END $$;

CREATE INDEX IF NOT EXISTS idx_todos_waiting
  ON public.todos (user_id, delegated_at)
  WHERE deleted_at IS NULL AND status = 'AGUARDANDO';


-- ════════════════════════════════════════════════════════════════════════════
-- 3) OBJETIVOS EM ÁRVORE
--    "Melhorar meu corpo" -> "Ir para a academia" -> "Ligar para academias".
--    Objetivo aninha em objetivo (parent_id); tarefa pendura no objetivo
--    (todos.goal_id, que já existia); tarefa aninha em tarefa (parent_task_id).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS parent_id bigint,
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_parent_id_fkey'
  ) THEN
    ALTER TABLE public.goals
      ADD CONSTRAINT goals_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES public.goals(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN public.goals.parent_id IS
  'Objetivo pai. NULL = objetivo de topo. Apagar o pai apaga a sub-árvore.';

CREATE INDEX IF NOT EXISTS idx_goals_parent ON public.goals (parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals (user_id, "position");

-- Subtarefas: uma tarefa pode nascer de outra.
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS parent_task_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todos_parent_task_id_fkey'
  ) THEN
    ALTER TABLE public.todos
      ADD CONSTRAINT todos_parent_task_id_fkey
      FOREIGN KEY (parent_task_id) REFERENCES public.todos(id) ON DELETE SET NULL;
  END IF;
END $$;

-- todos.goal_id já existia sem FK; garante a ligação e que apagar o objetivo
-- solte a tarefa em vez de apagá-la junto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todos_goal_id_fkey'
  ) THEN
    ALTER TABLE public.todos
      ADD CONSTRAINT todos_goal_id_fkey
      FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_todos_goal ON public.todos (goal_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_todos_parent_task ON public.todos (parent_task_id) WHERE deleted_at IS NULL;

-- RLS de goals (a tabela é antiga e pode ter vindo sem políticas).
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'goals' AND policyname = 'goals_select_own') THEN
    CREATE POLICY "goals_select_own" ON public.goals FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'goals' AND policyname = 'goals_insert_own') THEN
    CREATE POLICY "goals_insert_own" ON public.goals FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'goals' AND policyname = 'goals_update_own') THEN
    CREATE POLICY "goals_update_own" ON public.goals FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'goals' AND policyname = 'goals_delete_own') THEN
    CREATE POLICY "goals_delete_own" ON public.goals FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 4) HÁBITOS
--    Uma linha por hábito, uma linha por dia marcado. O UNIQUE(habit_id, day)
--    é o que deixa o clique no quadradinho ser idempotente.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.habits (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  color text DEFAULT '#6366f1',
  icon text,
  -- Dias em que o hábito vale: [1,3,5] = seg, qua, sex. Vazio/NULL = todo dia.
  weekdays jsonb,
  -- Meta de vezes por semana, para hábitos sem dia fixo ("3x na semana").
  target_per_week integer,
  goal_id bigint REFERENCES public.goals(id) ON DELETE SET NULL,
  "position" integer DEFAULT 0,
  archived_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.habit_logs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  habit_id bigint REFERENCES public.habits(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  day date NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT habit_logs_unique_day UNIQUE (habit_id, day)
);

CREATE INDEX IF NOT EXISTS idx_habits_user ON public.habits (user_id, "position") WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_day ON public.habit_logs (habit_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_day ON public.habit_logs (user_id, day DESC);

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'habits' AND policyname = 'habits_select_own') THEN
    CREATE POLICY "habits_select_own" ON public.habits FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'habits' AND policyname = 'habits_insert_own') THEN
    CREATE POLICY "habits_insert_own" ON public.habits FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'habits' AND policyname = 'habits_update_own') THEN
    CREATE POLICY "habits_update_own" ON public.habits FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'habits' AND policyname = 'habits_delete_own') THEN
    CREATE POLICY "habits_delete_own" ON public.habits FOR DELETE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'habit_logs' AND policyname = 'habit_logs_select_own') THEN
    CREATE POLICY "habit_logs_select_own" ON public.habit_logs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'habit_logs' AND policyname = 'habit_logs_insert_own') THEN
    CREATE POLICY "habit_logs_insert_own" ON public.habit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'habit_logs' AND policyname = 'habit_logs_delete_own') THEN
    CREATE POLICY "habit_logs_delete_own" ON public.habit_logs FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 5) BLOCOS DE TEMPO COM HORÁRIO VARIÁVEL POR DIA
--    A coluna view_groups.schedules (jsonb) já existe e estava sem uso.
--    Formato, com day = 0 (domingo) .. 6 (sábado):
--      [{"day":1,"start":"11:00","end":"14:00"},
--       {"day":2,"start":"06:00","end":"15:00"}]
--    Se schedules tiver qualquer entrada, ela manda: o bloco só roda nos dias
--    listados, com o horário de cada dia. Se for NULL/vazio, continua valendo
--    start_time + end_time + recurrence_days, como sempre foi.
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.view_groups.schedules IS
  'Horários por dia da semana: [{"day":1,"start":"11:00","end":"14:00"}]. Quando preenchido, substitui start_time/end_time/recurrence_days.';


-- ════════════════════════════════════════════════════════════════════════════
-- 6) REALTIME nas tabelas novas
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'habits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.habits;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'habit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.habit_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'goals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;
  END IF;
END $$;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS show_on_dashboard boolean DEFAULT true;
ALTER TABLE public.view_groups ADD COLUMN IF NOT EXISTS show_on_dashboard boolean DEFAULT true;

-- Garante que usuários possam atualizar show_on_dashboard nos seus próprios grupos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'view_groups'
    AND policyname = 'Users can update their own view_groups'
  ) THEN
    CREATE POLICY "Users can update their own view_groups"
      ON public.view_groups
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- Adiciona view_groups à publicação do Realtime para sincronizar o Dashboard
DO $$
BEGIN
  alter publication supabase_realtime add table public.view_groups;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;


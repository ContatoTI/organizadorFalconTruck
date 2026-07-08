-- Adiciona goals e finance_transactions à publicação do Supabase Realtime
-- para sincronização em tempo real entre abas/dispositivos.
alter publication supabase_realtime add table public.goals;
alter publication supabase_realtime add table public.finance_transactions;

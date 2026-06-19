-- Fix todos table
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS due_date date;

-- Fix finance_transactions table
ALTER TABLE public.finance_transactions RENAME COLUMN title TO description;
ALTER TABLE public.finance_transactions RENAME COLUMN transaction_date TO date;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS category text;

-- Fix goals table
ALTER TABLE public.goals RENAME COLUMN deadline TO target_date;

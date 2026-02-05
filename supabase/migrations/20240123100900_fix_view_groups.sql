-- Allow start_time and end_time to be null for categories
ALTER TABLE public.view_groups ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE public.view_groups ALTER COLUMN end_time DROP NOT NULL;

-- Add columns for categorization if they don't exist
ALTER TABLE public.view_groups ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.view_groups ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE public.view_groups ADD COLUMN IF NOT EXISTS color text;

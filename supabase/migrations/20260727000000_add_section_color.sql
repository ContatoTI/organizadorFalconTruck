-- Adiciona cor personalizável às pastas (sections)
alter table public.sections add column if not exists color text;

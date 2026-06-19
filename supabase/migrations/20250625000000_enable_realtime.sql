-- Garante que as tabelas necessárias estejam na publicação do Supabase Realtime
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.project_members;
alter publication supabase_realtime add table public.project_invites;
alter publication supabase_realtime add table public.sections;
alter publication supabase_realtime add table public.todos;

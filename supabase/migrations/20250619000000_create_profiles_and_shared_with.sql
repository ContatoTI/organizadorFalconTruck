-- Tabela de Profiles (sincronizada com auth.users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar RLS
alter table public.profiles enable row level security;

-- Política: qualquer usuário logado pode ver os profiles (para funcionalidade de compartilhar)
create policy "Authenticated users can view all profiles" on public.profiles
  for select using (auth.role() = 'authenticated');

-- Trigger para criar profile automaticamente ao criar usuário
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Adicionar coluna shared_with na tabela projects (array de UUIDs)
alter table public.projects add column if not exists shared_with uuid[] default '{}';

-- Atualizar política para permitir ver projects compartilhados
drop policy if exists "Users can view their own projects" on public.projects;
create policy "Users can view their own projects or shared" on public.projects
  for select using (auth.uid() = user_id or auth.uid() = any(shared_with));

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects or shared" on public.projects
  for update using (auth.uid() = user_id);

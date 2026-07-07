-- Tabela de notificações de envio para revisão
create table if not exists public.task_review_notifications (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  task_id bigint references public.todos(id) on delete cascade not null,
  task_title text not null,
  sender_name text not null,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS: usuário só vê as próprias notificações
alter table public.task_review_notifications enable row level security;

create policy "Usuário vê próprias notificações"
  on public.task_review_notifications for select
  using (auth.uid() = user_id);

create policy "Usuário pode deletar próprias notificações"
  on public.task_review_notifications for delete
  using (auth.uid() = user_id);

-- Qualquer autenticado pode inserir (a validação é feita no app)
create policy "Autenticados podem inserir notificações"
  on public.task_review_notifications for insert
  with check (auth.uid() is not null);

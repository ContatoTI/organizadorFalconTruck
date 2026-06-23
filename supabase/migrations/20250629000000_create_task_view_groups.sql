-- Create junction table for many-to-many between tasks and view_groups
-- Allows a task to be linked to multiple time blocks / lists
-- while still belonging to a project (project_id stays on the task)

create table if not exists task_view_groups (
  id bigint generated always as identity primary key,
  task_id bigint not null references todos(id) on delete cascade,
  view_group_id bigint not null references view_groups(id) on delete cascade,
  created_at timestamptz default now(),
  unique(task_id, view_group_id)
);

-- RLS: users can only see their own links
alter table task_view_groups enable row level security;

-- Policy: users can see links if the view_group belongs to them
create policy "Users can view task_view_groups for their view_groups"
  on task_view_groups for select
  using (
    view_group_id in (select id from view_groups where user_id = auth.uid())
  );

-- Policy: users can insert links if the view_group belongs to them
create policy "Users can insert task_view_groups for their view_groups"
  on task_view_groups for insert
  with check (
    view_group_id in (select id from view_groups where user_id = auth.uid())
  );

-- Policy: users can delete links if the view_group belongs to them
create policy "Users can delete task_view_groups for their view_groups"
  on task_view_groups for delete
  using (
    view_group_id in (select id from view_groups where user_id = auth.uid())
  );

-- Index for fast lookups by view_group_id
create index if not exists idx_task_view_groups_view_group_id on task_view_groups(view_group_id);
create index if not exists idx_task_view_groups_task_id on task_view_groups(task_id);

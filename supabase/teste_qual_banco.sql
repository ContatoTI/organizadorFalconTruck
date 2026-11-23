-- Teste: este banco é o que o site usa?
-- Antes de rodar: crie no SITE uma tarefa com o título  TESTE-BANCO-SITE
-- Depois rode isto no SQL Editor do Supabase. Só lê, não altera nada.

-- 1) Procura a tarefa de teste
select id, title, created_at
from public.todos
where title ilike '%TESTE-BANCO-SITE%';

-- 2) Últimas 10 tarefas criadas (compare com o que você vê no site)
select id, title, created_at
from public.todos
order by created_at desc
limit 10;

-- 3) Coluna nova da migration de hoje (ordem dos grupos) já existe aqui?
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'view_groups' and column_name = 'position';

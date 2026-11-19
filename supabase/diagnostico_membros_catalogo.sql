-- DIAGNÓSTICO (só leitura). Uma consulta só.
-- Mostra: (a) os projetos CATALOGO e quem é membro deles; (b) qualquer usuário com "michel" no nome/e-mail.
-- Me mande a tabela inteira do resultado.

select 'membro do projeto' as origem, p.id as projeto_id, p.name as projeto,
       pm.user_id, u.email as email_login, pr.email as email_perfil, pr.full_name as nome
from public.projects p
left join public.project_members pm on pm.project_id = p.id
left join auth.users u on u.id = pm.user_id
left join public.profiles pr on pr.id = pm.user_id
where p.id = 110 or p.name ilike '%catalogo%'

union all

select 'usuario michel', null, null,
       u.id, u.email, pr.email, coalesce(pr.full_name, u.raw_user_meta_data->>'full_name')
from auth.users u
left join public.profiles pr on pr.id = u.id
where u.email ilike '%michel%'
   or u.raw_user_meta_data->>'full_name' ilike '%michel%'
   or pr.full_name ilike '%michel%'
   or pr.email ilike '%michel%';

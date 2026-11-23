-- Rodar no SQL Editor do banco DINASTIA (Easypanel). NÃO rodar no banco do site.
-- Define uma senha nova para um usuário e confirma o e-mail dele.
-- Antes de rodar, troque os 2 valores abaixo.

update auth.users
set encrypted_password = extensions.crypt('COLOQUE_A_NOVA_SENHA', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = 'gabriel@gabriel.com';

-- Conferir (deve voltar 1 linha com confirmado = true)
select email, email_confirmed_at is not null as confirmado
from auth.users
where email = 'gabriel@gabriel.com';

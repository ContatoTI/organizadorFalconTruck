# Migração: banco da nuvem → banco do Easypanel

- **Origem (nuvem):** `qeforhnbgutipziaqqxc.supabase.co`, que é o banco usado pelo site hoje
- **Destino (Easypanel):** `dinastia-gerenciador-supa.ssdx0m.easypanel.host`

Os comandos rodam no **console do serviço `db`** do Supabase no Easypanel
(Easypanel → projeto → serviço do Supabase → `db` → **Console**). Esse console já tem `pg_dump` e `psql`, então não é preciso instalar nada no PC.

---

## 0. Pré-requisitos (antes do dia)

1. **String de conexão da nuvem.** Em supabase.com → projeto `qeforhnbgutipziaqqxc` → botão **Connect** → **Session pooler**. Copie a URI (porta 5432) e a senha do banco.
2. **Versão do Postgres** nos dois bancos. Na nuvem: Settings → Infrastructure. No Easypanel, rode `psql -U postgres -c "select version();"` no console.
   O `pg_dump` do Easypanel precisa ser da **mesma versão ou mais nova** que a da nuvem. Se for mais antigo, pare e me avise.
3. **Segurança do Easypanel.** Troque `JWT_SECRET`, `ANON_KEY` e `SERVICE_ROLE_KEY` (hoje são as chaves demo públicas). Gere chaves novas pelo guia oficial de self-hosting do Supabase e reinicie a stack.
4. Combine um horário para **pausar o uso do site** (cerca de 30 minutos).

## 1. Backup do Easypanel (para poder voltar)

```bash
pg_dump -U postgres -d postgres -Fc -f /tmp/backup_easypanel_antes.dump
```

## 2. Copiar da nuvem

```bash
export NUVEM='COLE_AQUI_A_URI_DO_SESSION_POOLER'

# estrutura do sistema (tabelas, funções, regras de acesso)
pg_dump "$NUVEM" --schema-only --schema=public --no-owner -f /tmp/schema.sql

# usuários e logins (senhas vão criptografadas)
pg_dump "$NUVEM" --data-only --table=auth.users --table=auth.identities -f /tmp/auth.sql

# dados do sistema
pg_dump "$NUVEM" --data-only --schema=public -f /tmp/dados.sql
```

## 3. Limpar o Easypanel e restaurar

⚠️ Este passo **apaga os dados atuais do Easypanel**, que ficam guardados no backup do passo 1.

```bash
psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
truncate auth.identities, auth.users cascade;
SQL

psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/schema.sql
psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "set session_replication_role = replica" -f /tmp/auth.sql -f /tmp/dados.sql
```

Se algum comando mostrar **ERROR**, pare e me mande as primeiras linhas do erro.

## 4. Conferir (rodar nos DOIS bancos e comparar)

```sql
select (select count(*) from auth.users)  as usuarios,
       (select count(*) from public.projects) as projetos,
       (select count(*) from public.todos)    as tarefas;
```

## 5. Trocar o site

Na Vercel → projeto `organizador-falcon-truck` → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL` = `https://dinastia-gerenciador-supa.ssdx0m.easypanel.host`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = a **nova** `ANON_KEY` do passo 0.3

Depois, faça o **Redeploy**. No PC, coloque os mesmos dois valores no `.env`.

Também é preciso configurar no Easypanel o login (Auth): `SITE_URL` e as URLs de redirecionamento com o endereço da Vercel, além do Google OAuth, se for usado.

## Para voltar atrás

Na Vercel, volte as duas variáveis para os valores da nuvem e faça o redeploy. A nuvem não é alterada em nenhum momento.

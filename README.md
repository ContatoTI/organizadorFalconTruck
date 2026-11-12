# Organizador Falcon Truck

Organizador de tarefas, projetos, agenda, metas, hábitos e finanças.

Stack: Next.js 15 + React 19 + Supabase + Tailwind (shadcn/ui).

## Setup

1. Copie `.env.example` para `.env` e preencha as chaves do Supabase.
2. Instale as dependências:

```bash
npm install
```

## Desenvolvimento

Servidor em `http://localhost:4000`:

```bash
npm run dev
```

Testes:

```bash
npm test
```

## Produção

```bash
npm run build
npm start
```

## Estrutura (MVC)

- `src/models/<modulo>` — regras de negócio e acesso a dados
- `src/controllers/<modulo>` — orquestração usada pelas rotas da API
- `src/views/<modulo>` — telas e componentes de cada módulo
- `app/api/*` — rotas da API (finas, chamam os controllers)
- `app/(default)/*` — páginas
- `components/ui` — componentes base do shadcn/ui
- `supabase/migrations` — migrações do banco
- `supabase/dumps` — dumps de referência (schema e dados)

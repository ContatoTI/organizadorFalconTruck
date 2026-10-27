import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Só para testes: query do Supabase falsa. Todo método encadeia e o await devolve `resultado`.

const METODOS = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'not', 'or',
  'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'single', 'maybeSingle'];

export function dbFalso(resultado: { data?: unknown; error?: { message: string } | null } = {}) {
  const chamadas: Record<string, unknown[][]> = {};
  const query: Record<string, unknown> = {};
  for (const m of METODOS) {
    query[m] = vi.fn((...args: unknown[]) => {
      (chamadas[m] ??= []).push(args);
      return query;
    });
  }
  query.then = (ok: (v: unknown) => unknown) => ok({ data: null, error: null, ...resultado });
  const from = vi.fn((_tabela: string) => query);
  const db = { from } as unknown as SupabaseClient;
  return { db, from, chamadas };
}

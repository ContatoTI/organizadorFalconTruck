import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Só para testes: banco falso com fila de respostas por tabela. Cada consulta
// à tabela consome a próxima resposta. Registra inserts/updates/deletes.

type Resposta = { data?: unknown; error?: { message: string; code?: string } | null };

export interface Gravacao {
  tabela: string;
  op: 'insert' | 'update' | 'delete' | 'upsert';
  valor: unknown;
  filtros: unknown[][];
}

const ENCADEADOS = ['select', 'in', 'neq', 'not', 'is', 'or', 'gte', 'lte', 'order', 'limit', 'maybeSingle', 'single'];

export function dbRoteiro(roteiro: Record<string, Resposta[]>) {
  const gravacoes: Gravacao[] = [];
  const from = vi.fn((tabela: string) => {
    const resposta = roteiro[tabela]?.shift() ?? { data: null };
    const filtros: unknown[][] = [];
    const q: Record<string, unknown> = {};
    for (const m of ENCADEADOS) q[m] = () => q;
    q.eq = (...a: unknown[]) => { filtros.push(a); return q; };
    for (const op of ['insert', 'update', 'delete', 'upsert'] as const) {
      // Clona o valor: o código testado pode alterar o objeto depois de gravar.
      q[op] = (valor?: unknown) => {
        gravacoes.push({ tabela, op, valor: valor === undefined ? undefined : structuredClone(valor), filtros });
        return q;
      };
    }
    q.then = (ok: (v: unknown) => unknown) => ok({ data: null, error: null, ...resposta });
    return q;
  });
  return { db: { from } as unknown as SupabaseClient, from, gravacoes };
}

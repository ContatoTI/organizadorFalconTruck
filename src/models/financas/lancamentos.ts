import type { SupabaseClient } from '@supabase/supabase-js';
import type { Finance } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

// Lançamentos financeiros do usuário (tabela finance_transactions).

export type TipoLancamento = Finance['type'];

export interface DadosLancamento {
  description: string;
  amount: number;
  type: TipoLancamento;
  category: string | null;
  date: string;
}

export interface Resumo {
  receitas: number;
  despesas: number;
  saldo: number;
}

const TABELA = 'finance_transactions';
const TIPOS: readonly TipoLancamento[] = ['income', 'expense'];

/** Normaliza o que veio da tela; dado inválido vira ErroValidacao. */
export function validarLancamento(entrada: Partial<Record<keyof DadosLancamento, unknown>>): DadosLancamento {
  const description = typeof entrada.description === 'string' ? entrada.description.trim() : '';
  if (!description) throw new ErroValidacao('Informe a descrição.');

  const amount = typeof entrada.amount === 'number' ? entrada.amount : parseFloat(String(entrada.amount ?? ''));
  if (!Number.isFinite(amount)) throw new ErroValidacao('Informe um valor válido.');

  const type = entrada.type as TipoLancamento;
  if (!TIPOS.includes(type)) throw new ErroValidacao('Tipo inválido.');

  const date = typeof entrada.date === 'string' ? entrada.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ErroValidacao('Informe uma data válida.');

  const category = typeof entrada.category === 'string' && entrada.category.trim() ? entrada.category : null;

  return { description, amount, type, category, date };
}

/** Receitas, despesas e saldo. Qualquer tipo que não seja receita conta como despesa. */
export function calcularResumo(lancamentos: Pick<Finance, 'type' | 'amount'>[]): Resumo {
  let receitas = 0;
  let despesas = 0;
  for (const l of lancamentos) {
    if (l.type === 'income') receitas += l.amount;
    else despesas += l.amount;
  }
  return { receitas, despesas, saldo: receitas - despesas };
}

export async function listar(db: SupabaseClient, usuarioId: string): Promise<Finance[]> {
  const { data, error } = await db
    .from(TABELA)
    .select('*')
    .eq('user_id', usuarioId)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Finance[];
}

export async function criar(db: SupabaseClient, usuarioId: string, dados: DadosLancamento): Promise<Finance> {
  const { data, error } = await db
    .from(TABELA)
    .insert({ ...dados, user_id: usuarioId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Finance;
}

export async function atualizar(db: SupabaseClient, usuarioId: string, id: number, dados: DadosLancamento): Promise<Finance | null> {
  const { data, error } = await db
    .from(TABELA)
    .update({ ...dados, user_id: usuarioId })
    .eq('id', id)
    .eq('user_id', usuarioId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Finance | null;
}

export async function excluir(db: SupabaseClient, usuarioId: string, id: number): Promise<void> {
  const { error } = await db.from(TABELA).delete().eq('id', id).eq('user_id', usuarioId);
  if (error) throw new Error(error.message);
}

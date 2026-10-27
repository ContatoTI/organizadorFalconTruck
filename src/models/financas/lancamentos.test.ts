import { describe, it, expect } from 'vitest';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import { ErroValidacao } from '@/src/lib/erros';
import { validarLancamento, calcularResumo, listar, criar, atualizar, excluir } from './lancamentos';

const valido = { description: 'Almoço', amount: '25.5', type: 'expense', category: '', date: '2026-10-27' };

describe('validarLancamento', () => {
  it('normaliza valor em texto e categoria vazia', () => {
    expect(validarLancamento(valido)).toEqual({
      description: 'Almoço', amount: 25.5, type: 'expense', category: null, date: '2026-10-27',
    });
  });
  it.each([
    [{ description: '  ' }, /descrição/],
    [{ amount: '' }, /valor/],
    [{ amount: 'abc' }, /valor/],
    [{ type: 'outro' }, /Tipo/],
    [{ date: '27/10/2026' }, /data/],
  ])('recusa %o', (troca, mensagem) => {
    expect(() => validarLancamento({ ...valido, ...troca })).toThrow(ErroValidacao);
    expect(() => validarLancamento({ ...valido, ...troca })).toThrow(mensagem);
  });
});

describe('calcularResumo', () => {
  it('soma receitas, despesas e saldo', () => {
    expect(calcularResumo([
      { type: 'income', amount: 100 },
      { type: 'expense', amount: 30 },
      { type: 'expense', amount: 20 },
    ])).toEqual({ receitas: 100, despesas: 50, saldo: 50 });
  });
  it('lista vazia zera tudo', () => {
    expect(calcularResumo([])).toEqual({ receitas: 0, despesas: 0, saldo: 0 });
  });
});

describe('banco', () => {
  const dados = validarLancamento(valido);

  it('lista só do usuário, mais recentes primeiro', async () => {
    const { db, from, chamadas } = dbFalso({ data: [{ id: 1 }] });
    await expect(listar(db, 'u1')).resolves.toEqual([{ id: 1 }]);
    expect(from).toHaveBeenCalledWith('finance_transactions');
    expect(chamadas.eq).toEqual([['user_id', 'u1']]);
    expect(chamadas.order).toEqual([['date', { ascending: false }]]);
  });

  it('cria com o dono', async () => {
    const { db, chamadas } = dbFalso({ data: { id: 9 } });
    await criar(db, 'u1', dados);
    expect(chamadas.insert[0][0]).toEqual({ ...dados, user_id: 'u1' });
  });

  it('atualiza só lançamento do usuário', async () => {
    const { db, chamadas } = dbFalso({ data: { id: 9 } });
    await atualizar(db, 'u1', 9, dados);
    expect(chamadas.eq).toEqual([['id', 9], ['user_id', 'u1']]);
  });

  it('exclui só lançamento do usuário', async () => {
    const { db, chamadas } = dbFalso();
    await excluir(db, 'u1', 9);
    expect(chamadas.eq).toEqual([['id', 9], ['user_id', 'u1']]);
  });

  it('erro do banco sobe', async () => {
    const { db } = dbFalso({ error: { message: 'falhou' } });
    await expect(listar(db, 'u1')).rejects.toThrow('falhou');
  });
});

import { describe, it, expect } from 'vitest';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import { ErroValidacao } from '@/src/lib/erros';
import {
  validarNovo, validarAlteracao, validarDia,
  listar, marcacoesRecentes, criar, atualizar, excluir, marcar, desmarcar,
} from './habitos';

describe('validação', () => {
  it('novo hábito: aplica padrões e limpa dados', () => {
    expect(validarNovo({ title: '  Ler ', weekdays: [1, 9, 3], icon: '' })).toEqual({
      title: 'Ler', color: '#6366f1', icon: null, weekdays: [1, 3], targetPerWeek: null, goalId: null,
    });
  });
  it('novo hábito sem título é recusado', () => {
    expect(() => validarNovo({ title: '  ' })).toThrow(ErroValidacao);
  });
  it('alteração só deixa passar colunas permitidas', () => {
    expect(validarAlteracao({ title: 'X', user_id: 'outro', position: 99, weekdays: [] }))
      .toEqual({ title: 'X', weekdays: null });
  });
  it('alteração vazia ou com título vazio é recusada', () => {
    expect(() => validarAlteracao({ user_id: 'x' })).toThrow(/Nada para alterar/);
    expect(() => validarAlteracao({ title: '' })).toThrow(/Título/);
  });
  it('arquivar passa archived_at', () => {
    expect(validarAlteracao({ archived_at: '2026-10-27T00:00:00Z' })).toEqual({ archived_at: '2026-10-27T00:00:00Z' });
  });
  it('dia precisa ser AAAA-MM-DD', () => {
    expect(validarDia('2026-10-27')).toBe('2026-10-27');
    expect(() => validarDia('27/10/2026')).toThrow(ErroValidacao);
  });
});

describe('banco', () => {
  it('lista só ativos do usuário e normaliza dias', async () => {
    const { db, chamadas } = dbFalso({ data: [{ id: 1, weekdays: '[2]' }] });
    const lista = await listar(db, 'u1');
    expect(lista[0].weekdays).toEqual([2]);
    expect(chamadas.eq).toEqual([['user_id', 'u1']]);
    expect(chamadas.is).toEqual([['archived_at', null]]);
  });

  it('marcações desde N dias atrás', async () => {
    const { db, chamadas } = dbFalso({ data: [] });
    await marcacoesRecentes(db, 'u1', 10, new Date(2026, 9, 27));
    expect(chamadas.gte).toEqual([['day', '2026-10-17']]);
  });

  it('cria na próxima posição', async () => {
    const { db, chamadas } = dbFalso({ data: { id: 5, position: 3, weekdays: null } });
    await criar(db, 'u1', validarNovo({ title: 'Ler' }));
    expect(chamadas.insert[0][0]).toMatchObject({ user_id: 'u1', title: 'Ler', position: 4 });
  });

  it('altera e exclui só do usuário', async () => {
    const a = dbFalso();
    await atualizar(a.db, 'u1', 7, { title: 'X' });
    expect(a.chamadas.eq).toEqual([['id', 7], ['user_id', 'u1']]);
    const b = dbFalso();
    await excluir(b.db, 'u1', 7);
    expect(b.chamadas.eq).toEqual([['id', 7], ['user_id', 'u1']]);
  });

  it('marcar é idempotente e desmarcar apaga só do usuário', async () => {
    const a = dbFalso();
    await marcar(a.db, 'u1', 7, '2026-10-27');
    expect(a.chamadas.upsert[0]).toEqual([
      { user_id: 'u1', habit_id: 7, day: '2026-10-27' },
      { onConflict: 'habit_id,day', ignoreDuplicates: true },
    ]);
    const b = dbFalso();
    await desmarcar(b.db, 'u1', 7, '2026-10-27');
    expect(b.chamadas.eq).toEqual([['habit_id', 7], ['day', '2026-10-27'], ['user_id', 'u1']]);
  });

  it('erro do banco sobe', async () => {
    const { db } = dbFalso({ error: { message: 'falhou' } });
    await expect(excluir(db, 'u1', 1)).rejects.toThrow('falhou');
  });
});

import { describe, it, expect } from 'vitest';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import { listar, restaurar, excluirDeVez } from './lixeira';

describe('lixeira', () => {
  it('lista só excluídas, mais recentes primeiro', async () => {
    const { db, chamadas } = dbFalso({ data: [{ id: 1 }] });
    expect(await listar(db)).toEqual([{ id: 1 }]);
    expect(chamadas.not).toEqual([['deleted_at', 'is', null]]);
    expect(chamadas.order).toEqual([['deleted_at', { ascending: false }]]);
  });

  it('restaura só tarefa que está na lixeira', async () => {
    const { db, chamadas } = dbFalso({ data: [{ id: 5 }] });
    expect(await restaurar(db, 5)).toBe(true);
    expect(chamadas.update[0][0]).toEqual({ deleted_at: null });
    expect(chamadas.eq).toEqual([['id', 5]]);
    expect(chamadas.not).toEqual([['deleted_at', 'is', null]]);
  });

  it('não achou (fora da lixeira ou sem permissão) devolve false', async () => {
    const { db } = dbFalso({ data: [] });
    expect(await restaurar(db, 5)).toBe(false);
    expect(await excluirDeVez(db, 5)).toBe(false);
  });

  it('exclui de vez só da lixeira', async () => {
    const { db, chamadas } = dbFalso({ data: [{ id: 5 }] });
    expect(await excluirDeVez(db, 5)).toBe(true);
    expect(chamadas.delete).toHaveLength(1);
    expect(chamadas.not).toEqual([['deleted_at', 'is', null]]);
  });

  it('erro do banco sobe', async () => {
    const { db } = dbFalso({ error: { message: 'falhou' } });
    await expect(listar(db)).rejects.toThrow('falhou');
  });
});

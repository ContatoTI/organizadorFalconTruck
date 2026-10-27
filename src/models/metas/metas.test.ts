import { describe, it, expect } from 'vitest';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import { ErroValidacao } from '@/src/lib/erros';
import {
  validarNova, validarAlteracao, lerIds, listar, criar, atualizar, excluir, tarefasDasMetas,
} from './metas';

describe('validação', () => {
  it('nova meta: aplica padrões', () => {
    expect(validarNova({ title: ' Saúde ', parentId: 3 })).toEqual({
      title: 'Saúde', parentId: 3, description: null, targetDate: null, color: '#6366f1',
    });
  });
  it('nova meta sem título ou data errada é recusada', () => {
    expect(() => validarNova({ title: '' })).toThrow(ErroValidacao);
    expect(() => validarNova({ title: 'X', targetDate: '31/12' })).toThrow(/Data/);
  });
  it('alteração só passa colunas permitidas', () => {
    expect(validarAlteracao({ title: 'Y', user_id: 'hack', target_date: '' }, 1))
      .toEqual({ title: 'Y', target_date: null });
  });
  it('não deixa a meta virar filha dela mesma', () => {
    expect(() => validarAlteracao({ parent_id: 7 }, 7)).toThrow(/dentro dele mesmo/);
  });
  it('lê lista de ids', () => {
    expect(lerIds('1,2,3')).toEqual([1, 2, 3]);
    expect(lerIds(null)).toEqual([]);
    expect(() => lerIds('1,x')).toThrow(ErroValidacao);
  });
});

describe('banco', () => {
  it('lista do usuário em ordem', async () => {
    const { db, chamadas } = dbFalso({ data: [] });
    await listar(db, 'u1');
    expect(chamadas.eq).toEqual([['user_id', 'u1']]);
    expect(chamadas.order[0]).toEqual(['position', { ascending: true }]);
  });

  it('cria no fim dos irmãos', async () => {
    const { db, chamadas } = dbFalso({ data: { id: 1, position: 2 } });
    await criar(db, 'u1', validarNova({ title: 'X', parentId: 5 }));
    expect(chamadas.eq).toContainEqual(['parent_id', 5]);
    expect(chamadas.insert[0][0]).toMatchObject({ user_id: 'u1', parent_id: 5, position: 3, is_completed: false });
  });

  it('cria no topo quando não tem pai', async () => {
    const { db, chamadas } = dbFalso({ data: null });
    await criar(db, 'u1', validarNova({ title: 'X' }));
    expect(chamadas.is).toEqual([['parent_id', null]]);
    expect(chamadas.insert[0][0]).toMatchObject({ position: 0 });
  });

  it('altera com updated_at e só do usuário', async () => {
    const { db, chamadas } = dbFalso();
    await atualizar(db, 'u1', 4, { title: 'Z' });
    expect(chamadas.update[0][0]).toMatchObject({ title: 'Z', updated_at: expect.any(String) });
    expect(chamadas.eq).toEqual([['id', 4], ['user_id', 'u1']]);
  });

  it('exclui só do usuário', async () => {
    const { db, chamadas } = dbFalso();
    await excluir(db, 'u1', 4);
    expect(chamadas.eq).toEqual([['id', 4], ['user_id', 'u1']]);
  });

  it('tarefas das metas: vazio não consulta', async () => {
    const vazio = dbFalso();
    expect(await tarefasDasMetas(vazio.db, [])).toEqual([]);
    expect(vazio.from).not.toHaveBeenCalled();
    const { db, chamadas } = dbFalso({ data: [{ id: 1 }] });
    expect(await tarefasDasMetas(db, [1, 2])).toEqual([{ id: 1 }]);
    expect(chamadas.in).toEqual([['goal_id', [1, 2]]]);
    expect(chamadas.is).toEqual([['deleted_at', null]]);
  });
});

import { describe, it, expect } from 'vitest';
import { dbRoteiro } from '@/src/lib/testes/dbRoteiro';
import { ErroValidacao } from '@/src/lib/erros';
import {
  validarNova, validarAlteracao, validarIndice, listar, criar, atualizar, excluir, reordenar, moverParaProjeto,
} from './pastas';

const UID = '11111111-1111-1111-1111-111111111111';

describe('validação', () => {
  it('nova pasta', () => {
    expect(validarNova({ title: ' Elétrica ', color: '#f00', defaultAssigneeId: UID }))
      .toEqual({ title: 'Elétrica', color: '#f00', defaultAssigneeId: UID });
    expect(validarNova({ title: 'X' })).toEqual({ title: 'X', color: null, defaultAssigneeId: null });
    expect(() => validarNova({ title: '' })).toThrow(ErroValidacao);
    expect(() => validarNova({ title: 'X', defaultAssigneeId: 'abc' })).toThrow(/Responsável/);
  });
  it('alteração', () => {
    expect(validarAlteracao({ title: ' Y ', default_assignee_id: null, project_id: 9 }))
      .toEqual({ title: 'Y', default_assignee_id: null });
    expect(() => validarAlteracao({ project_id: 9 })).toThrow(/Nada/);
  });
  it('índice', () => {
    expect(validarIndice(0)).toBe(0);
    expect(() => validarIndice(-1)).toThrow(ErroValidacao);
  });
});

describe('banco', () => {
  it('lista em ordem', async () => {
    const { db } = dbRoteiro({ sections: [{ data: [{ id: 1 }] }] });
    expect(await listar(db, 5)).toEqual([{ id: 1 }]);
  });

  it('cria no fim do projeto', async () => {
    const { db, gravacoes } = dbRoteiro({ sections: [{ data: { order: 2 } }, { data: { id: 7 } }] });
    await criar(db, 'u1', 5, { title: 'A', color: null, defaultAssigneeId: null });
    expect(gravacoes[0].valor).toEqual({ user_id: 'u1', project_id: 5, title: 'A', color: null, order: 3, default_assignee_id: null });
  });

  it('altera e exclui soltando as tarefas', async () => {
    const a = dbRoteiro({});
    await atualizar(a.db, 7, { title: 'B' });
    expect(a.gravacoes[0]).toMatchObject({ tabela: 'sections', op: 'update', valor: { title: 'B' } });

    const b = dbRoteiro({});
    await excluir(b.db, 7);
    expect(b.gravacoes.map(g => [g.tabela, g.op, g.valor])).toEqual([
      ['todos', 'update', { section_id: null }],
      ['sections', 'delete', undefined],
    ]);
  });

  it('reordena renumerando só o que mudou', async () => {
    const { db, gravacoes } = dbRoteiro({
      sections: [
        { data: { project_id: 5 } },
        { data: [{ id: 1, order: 0 }, { id: 2, order: 1 }, { id: 3, order: 2 }] },
        {}, {}, {},
      ],
    });
    await reordenar(db, 3, 0);
    expect(gravacoes.map(g => [g.valor, g.filtros[0]])).toEqual([
      [{ order: 0 }, ['id', 3]],
      [{ order: 1 }, ['id', 1]],
      [{ order: 2 }, ['id', 2]],
    ]);
  });

  it('move pasta e tarefas para outro projeto', async () => {
    const { db, gravacoes } = dbRoteiro({ sections: [{ data: null }, {}], todos: [{}] });
    await moverParaProjeto(db, 7, 9);
    expect(gravacoes.map(g => [g.tabela, g.valor])).toEqual([
      ['sections', { project_id: 9, order: 0 }],
      ['todos', { project_id: 9 }],
    ]);
  });
});

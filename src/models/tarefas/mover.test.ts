import { describe, it, expect } from 'vitest';
import { dbRoteiro } from '@/src/lib/testes/dbRoteiro';
import {
  paraGrupo, paraProjeto, loteParaPasta, reordenar,
  vincularAoGrupo, desvincularDoGrupo, removerDoGrupo, gruposVinculados,
} from './mover';

describe('mover', () => {
  it('para grupo: sai do projeto e reabre a tarefa', async () => {
    const { db, gravacoes } = dbRoteiro({});
    await paraGrupo(db, 7, 3);
    expect(gravacoes[0].valor).toEqual({
      view_group_id: 3, project_id: null, section_id: null, is_completed: false, status: 'A_FAZER',
    });
  });

  it('para projeto: sai do grupo e cai na pasta pedida', async () => {
    const { db, gravacoes } = dbRoteiro({});
    await paraProjeto(db, 7, 5, 2);
    expect(gravacoes[0].valor).toEqual({ project_id: 5, view_group_id: null, section_id: 2 });
  });

  it('lote para pasta; lista vazia nem consulta', async () => {
    const a = dbRoteiro({});
    await loteParaPasta(a.db, [1, 2], 9);
    expect(a.gravacoes[0].valor).toEqual({ section_id: 9 });
    const b = dbRoteiro({});
    await loteParaPasta(b.db, [], 9);
    expect(b.gravacoes).toHaveLength(0);
  });

  it('reordenar: insere no índice, renumera destino e origem', async () => {
    const { db, gravacoes } = dbRoteiro({
      todos: [
        { data: { section_id: 1 } },                     // pasta de origem da tarefa 7
        { data: [{ id: 4 }, { id: 5 }] },                // destino (pasta 2)
        {}, {}, {},                                      // 3 updates do destino
        { data: [{ id: 8 }] },                           // origem (pasta 1) após mover
        {},                                              // 1 update da origem
      ],
    });
    await reordenar(db, 7, 2, 1, 10);
    expect(gravacoes.map(g => [g.valor, g.filtros[0]])).toEqual([
      [{ position: 0 }, ['id', 4]],
      [{ position: 1, section_id: 2 }, ['id', 7]],
      [{ position: 2 }, ['id', 5]],
      [{ position: 0 }, ['id', 8]],
    ]);
  });

  it('reordenar na mesma pasta não renumera origem de novo', async () => {
    const { db, gravacoes } = dbRoteiro({
      todos: [{ data: { section_id: 2 } }, { data: [{ id: 7 }, { id: 4 }] }, {}, {}],
    });
    await reordenar(db, 7, 2, 1, 10);
    expect(gravacoes.map(g => [g.valor, g.filtros[0]])).toEqual([
      [{ position: 0 }, ['id', 4]],
      [{ position: 1, section_id: 2 }, ['id', 7]],
    ]);
  });

  it('reordenar tarefa inexistente é recusado', async () => {
    await expect(reordenar(dbRoteiro({ todos: [{ data: null }] }).db, 7, 2, 1, 10))
      .rejects.toThrow(/não encontrada/);
  });
});

describe('vínculos com grupos', () => {
  it('vincular não duplica', async () => {
    const novo = dbRoteiro({ task_view_groups: [{ data: null }, {}] });
    await vincularAoGrupo(novo.db, 7, 3);
    expect(novo.gravacoes[0]).toMatchObject({ op: 'insert', valor: { task_id: 7, view_group_id: 3 } });

    const repetido = dbRoteiro({ task_view_groups: [{ data: { id: 1 } }] });
    await vincularAoGrupo(repetido.db, 7, 3);
    expect(repetido.gravacoes).toHaveLength(0);
  });

  it('desvincular apaga só o vínculo', async () => {
    const { db, gravacoes } = dbRoteiro({});
    await desvincularDoGrupo(db, 7, 3);
    expect(gravacoes[0]).toMatchObject({ tabela: 'task_view_groups', op: 'delete', filtros: [['task_id', 7], ['view_group_id', 3]] });
  });

  it('remover do grupo limpa o campo direto quando é o mesmo grupo', async () => {
    const direto = dbRoteiro({ todos: [{ data: { view_group_id: 3 } }, {}] });
    await removerDoGrupo(direto.db, 7, 3);
    expect(direto.gravacoes.map(g => [g.tabela, g.op])).toEqual([['todos', 'update'], ['task_view_groups', 'delete']]);
    expect(direto.gravacoes[0].valor).toEqual({ view_group_id: null });

    const outroGrupo = dbRoteiro({ todos: [{ data: { view_group_id: 9 } }] });
    await removerDoGrupo(outroGrupo.db, 7, 3);
    expect(outroGrupo.gravacoes.map(g => g.op)).toEqual(['delete']);
  });

  it('lista os grupos vinculados', async () => {
    const { db } = dbRoteiro({ task_view_groups: [{ data: [{ view_group_id: 3 }, { view_group_id: 9 }] }] });
    expect(await gruposVinculados(db, 7)).toEqual([3, 9]);
  });
});

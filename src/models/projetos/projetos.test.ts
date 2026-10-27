import { describe, it, expect } from 'vitest';
import { dbRoteiro } from '@/src/lib/testes/dbRoteiro';
import { ErroValidacao } from '@/src/lib/erros';
import {
  validarNovo, validarAlteracao, listarProprioseMembro, listarTodos, criar, atualizar, excluir,
  acesso, projetosQueCompartilhei, projetosQueParticipo,
} from './projetos';

describe('validação', () => {
  it('novo projeto: limpa nome e pastas', () => {
    expect(validarNovo({ nome: ' Obra ', cor: '#111', pastas: [' A ', '', 'B', 3] }))
      .toEqual({ nome: 'Obra', cor: '#111', pastas: ['A', 'B'] });
    expect(validarNovo({ nome: 'X' })).toEqual({ nome: 'X', cor: '#6366f1', pastas: [] });
  });
  it('recusa nome vazio', () => {
    expect(() => validarNovo({ nome: '  ' })).toThrow(ErroValidacao);
  });
  it('alteração só com campos permitidos', () => {
    expect(validarAlteracao({ name: ' Y ', owner_id: 'hack', show_on_dashboard: false }))
      .toEqual({ name: 'Y', show_on_dashboard: false });
    expect(() => validarAlteracao({ owner_id: 'x' })).toThrow(/Nada/);
    expect(() => validarAlteracao({ show_on_dashboard: 'sim' })).toThrow(/Visibilidade/);
  });
});

describe('listagens', () => {
  it('próprios + membro, sem repetir', async () => {
    const { db } = dbRoteiro({
      projects: [{ data: [{ id: 1 }, { id: 2 }] }, { data: [{ id: 2 }, { id: 3 }] }],
      project_members: [{ data: [{ project_id: 2 }, { project_id: 3 }] }],
    });
    expect((await listarProprioseMembro(db, 'u1')).map(p => p.id)).toEqual([1, 2, 3]);
  });

  it('todos: inclui projetos alcançados só por pasta, tarefa ou atribuição', async () => {
    const { db } = dbRoteiro({
      projects: [{ data: [{ id: 1 }] }, { data: [{ id: 10 }, { id: 20 }, { id: 30 }] }],
      project_members: [{ data: [{ project_id: 10 }] }],
      section_shares: [{ data: [{ section_id: 5 }] }],
      task_shares: [{ data: [{ task_id: 7 }] }],
      todos: [{ data: [{ project_id: 30 }] }, { data: [{ project_id: 1 }] }],
      sections: [{ data: [{ project_id: 20 }] }],
    });
    expect((await listarTodos(db, 'u1', 0)).map(p => p.id)).toEqual([1, 10, 20, 30]);
  });

  it('todos: projeto que a RLS ainda não mostra entra pela última tentativa', async () => {
    const { db } = dbRoteiro({
      projects: [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [{ id: 10 }, { id: 99 }] }],
      project_members: [{ data: [{ project_id: 10 }] }],
      section_shares: [{ data: [] }],
      task_shares: [{ data: [] }],
      todos: [{ data: [] }],
    });
    expect((await listarTodos(db, 'u1', 0)).map(p => p.id)).toEqual([10]);
  });
});

describe('escrita', () => {
  it('cria o projeto com as pastas iniciais em ordem', async () => {
    const { db, gravacoes } = dbRoteiro({ projects: [{ data: { id: 9 } }], sections: [{}] });
    await criar(db, 'u1', { nome: 'Obra', cor: '#111', pastas: ['A', 'B'] });
    expect(gravacoes[0].valor).toEqual({ owner_id: 'u1', name: 'Obra', color: '#111' });
    expect(gravacoes[1].valor).toEqual([
      { user_id: 'u1', project_id: 9, title: 'A', order: 0 },
      { user_id: 'u1', project_id: 9, title: 'B', order: 1 },
    ]);
  });

  it('alterar devolve false sem permissão', async () => {
    expect(await atualizar(dbRoteiro({ projects: [{ data: [{ id: 1 }] }] }).db, 1, { name: 'X' })).toBe(true);
    expect(await atualizar(dbRoteiro({ projects: [{ data: [] }] }).db, 1, { name: 'X' })).toBe(false);
  });

  it('excluir solta as tarefas antes de apagar', async () => {
    const { db, gravacoes } = dbRoteiro({ todos: [{}], projects: [{ data: [{ id: 4 }] }] });
    expect(await excluir(db, 4)).toBe(true);
    expect(gravacoes.map(g => [g.tabela, g.op, g.valor])).toEqual([
      ['todos', 'update', { project_id: null, section_id: null }],
      ['projects', 'delete', undefined],
    ]);
  });
});

describe('acesso', () => {
  it('dono é membro também', async () => {
    expect(await acesso(dbRoteiro({ projects: [{ data: { owner_id: 'u1' } }] }).db, 1, 'u1')).toEqual({ dono: true, membro: true });
  });
  it('membro e de fora', async () => {
    const membro = dbRoteiro({ projects: [{ data: { owner_id: 'x' } }], project_members: [{ data: { id: 3 } }] });
    expect(await acesso(membro.db, 1, 'u1')).toEqual({ dono: false, membro: true });
    const fora = dbRoteiro({ projects: [{ data: { owner_id: 'x' } }], project_members: [{ data: null }] });
    expect(await acesso(fora.db, 1, 'u1')).toEqual({ dono: false, membro: false });
  });
});

describe('compartilhamentos', () => {
  it('projetos que compartilhei: só os que têm membros', async () => {
    const { db } = dbRoteiro({
      projects: [{ data: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] }],
      project_members: [{ data: [{ project_id: 1, user_id: 'p1' }] }],
      profiles: [{ data: [{ id: 'p1', full_name: 'Ana' }] }],
    });
    expect(await projetosQueCompartilhei(db, 'u1')).toEqual([
      { project: { id: 1, name: 'A' }, members: [{ id: 'p1', full_name: 'Ana' }] },
    ]);
  });

  it('projetos que participo: com dono e contagem', async () => {
    const { db } = dbRoteiro({
      project_members: [{ data: [{ project_id: 5 }] }, { data: [{ project_id: 5 }, { project_id: 5 }] }],
      projects: [{ data: [{ id: 5, name: 'P', owner_id: 'd' }] }],
      profiles: [{ data: [{ id: 'd', full_name: 'Dono' }] }],
    });
    expect(await projetosQueParticipo(db, 'u1')).toEqual([
      { project: { id: 5, name: 'P', owner_id: 'd' }, owner: { id: 'd', full_name: 'Dono' }, memberCount: 2 },
    ]);
  });
});

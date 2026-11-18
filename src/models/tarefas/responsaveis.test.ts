import { describe, it, expect } from 'vitest';
import { dbRoteiro } from '@/src/lib/testes/dbRoteiro';
import { validarIds, diferenca, definir, listar, acessoDaTarefa, LIMITE_RESPONSAVEIS } from './responsaveis';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

describe('validarIds', () => {
  it('aceita lista vazia e tira repetidos', () => {
    expect(validarIds([])).toEqual([]);
    expect(validarIds([A, A, B])).toEqual([A, B]);
  });
  it('recusa o que não é lista ou id inválido', () => {
    expect(() => validarIds('x')).toThrow(/inválida/);
    expect(() => validarIds([A, 'abc'])).toThrow(/inválido/);
    expect(() => validarIds([A, 5])).toThrow(/inválido/);
  });
  it('recusa acima do limite', () => {
    const muitos = Array.from({ length: LIMITE_RESPONSAVEIS + 1 }, (_, i) =>
      `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    expect(() => validarIds(muitos)).toThrow(/No máximo/);
  });
});

describe('diferenca', () => {
  it('separa quem entra e quem sai', () => {
    expect(diferenca([A, B], [B, C])).toEqual({ entram: [C], saem: [A] });
  });
  it('sem mudança, nada entra nem sai', () => {
    expect(diferenca([A], [A])).toEqual({ entram: [], saem: [] });
  });
});

describe('definir', () => {
  it('apaga quem saiu, grava quem entrou e devolve quem entrou', async () => {
    const { db, gravacoes } = dbRoteiro({ task_shares: [{ data: [{ user_id: A }, { user_id: B }] }] });
    const entraram = await definir(db, 7, [B, C]);
    expect(entraram).toEqual([C]);
    expect(gravacoes.map(g => g.op)).toEqual(['delete', 'insert']);
    expect(gravacoes[1].valor).toEqual([{ task_id: 7, user_id: C }]);
  });
  it('não grava nada quando a lista é a mesma', async () => {
    const { db, gravacoes } = dbRoteiro({ task_shares: [{ data: [{ user_id: A }] }] });
    expect(await definir(db, 7, [A])).toEqual([]);
    expect(gravacoes).toEqual([]);
  });
  it('erro do banco (ex.: sem permissão) vira erro', async () => {
    const { db } = dbRoteiro({ task_shares: [{ data: [] }, { error: { message: 'RLS' } }] });
    await expect(definir(db, 7, [A])).rejects.toThrow('RLS');
  });
});

describe('listar', () => {
  it('devolve nome do perfil, senão e-mail', async () => {
    const { db } = dbRoteiro({
      task_shares: [{ data: [{ user_id: A }, { user_id: B }] }],
      profiles: [{ data: [{ id: A, full_name: 'Ana', email: 'a@x' }, { id: B, full_name: null, email: 'b@x' }] }],
    });
    expect(await listar(db, 7)).toEqual([{ usuario_id: A, nome: 'Ana' }, { usuario_id: B, nome: 'b@x' }]);
  });
});

describe('acessoDaTarefa', () => {
  it('null quando a tarefa não é visível', async () => {
    const { db } = dbRoteiro({ todos: [{ data: null }] });
    expect(await acessoDaTarefa(db, 7, A)).toBeNull();
  });
  it('sabe se o usuário é dono do projeto', async () => {
    const { db } = dbRoteiro({
      todos: [{ data: { title: 'T', assignee_id: B, project_id: 3 } }],
      projects: [{ data: { owner_id: A } }],
    });
    expect(await acessoDaTarefa(db, 7, A)).toEqual({ titulo: 'T', principal: B, ehDonoDoProjeto: true });
  });
  it('tarefa sem projeto: ninguém é dono', async () => {
    const { db } = dbRoteiro({ todos: [{ data: { title: 'T', assignee_id: null, project_id: null } }] });
    expect((await acessoDaTarefa(db, 7, A))?.ehDonoDoProjeto).toBe(false);
  });
});

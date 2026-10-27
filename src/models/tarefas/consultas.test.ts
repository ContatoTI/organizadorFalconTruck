import { describe, it, expect } from 'vitest';
import type { Task } from '@/types/index';
import { dbRoteiro } from '@/src/lib/testes/dbRoteiro';
import { ErroValidacao } from '@/src/lib/erros';
import { validarHoje, buscar, listar, aguardando } from './consultas';

const HOJE = '2026-10-27';

const tarefa = (id: number, extra: Partial<Task> = {}): Task => ({
  id,
  user_id: 'u1',
  title: `T${id}`,
  is_completed: false,
  due_date: null,
  view_group_id: null,
  project_id: null,
  section_id: null,
  position: 0,
  description: null,
  priority: null,
  status: 'A_FAZER',
  status_changed_at: new Date().toISOString(),
  auto_review_reason: null,
  created_at: `2026-10-0${(id % 9) + 1}T00:00:00Z`,
  ...extra,
});

describe('validarHoje', () => {
  it('aceita AAAA-MM-DD e recusa o resto', () => {
    expect(validarHoje(HOJE)).toBe(HOJE);
    expect(() => validarHoje('27/10/2026')).toThrow(ErroValidacao);
    expect(() => validarHoje(undefined)).toThrow(ErroValidacao);
  });
});

describe('buscar', () => {
  it('devolve a tarefa com nomes e grupos vinculados', async () => {
    const { db } = dbRoteiro({
      todos: [{ data: tarefa(1, { assignee_id: 'p2' }) }],
      profiles: [
        { data: [{ id: 'u1', full_name: 'Ana', email: null }] },
        { data: [{ id: 'p2', full_name: null, email: 'b@x.com' }] },
      ],
      task_view_groups: [{ data: [{ task_id: 1, view_group_id: 7 }] }],
    });
    const t = await buscar(db, 1, HOJE);
    expect(t).toMatchObject({ id: 1, creator_name: 'Ana', assignee_name: 'b@x.com', linked_view_group_ids: [7] });
  });

  it('não encontrada devolve null', async () => {
    expect(await buscar(dbRoteiro({ todos: [{ data: null }] }).db, 1, HOJE)).toBeNull();
  });

  it('vencida entra em revisão (gravando no banco)', async () => {
    const { db, gravacoes } = dbRoteiro({
      todos: [{ data: tarefa(1, { due_date: '2026-10-26' }) }, {}],
      profiles: [{ data: [] }, { data: [] }],
      task_view_groups: [{ data: [] }],
    });
    const t = await buscar(db, 1, HOJE);
    expect(t?.status).toBe('REVISAO');
    expect(gravacoes[0]).toMatchObject({ tabela: 'todos', op: 'update', valor: { status: 'REVISAO' } });
  });

  it('vence hoje ainda não é vencida', async () => {
    const { db, gravacoes } = dbRoteiro({
      todos: [{ data: tarefa(1, { due_date: HOJE }) }],
      profiles: [{ data: [] }, { data: [] }],
      task_view_groups: [{ data: [] }],
    });
    const t = await buscar(db, 1, HOJE);
    expect(t?.status).toBe('A_FAZER');
    expect(gravacoes).toHaveLength(0);
  });

  it('parada há mais de 1 dia vai para revisão com a etiqueta', async () => {
    const ontem = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { db, gravacoes } = dbRoteiro({
      todos: [{ data: tarefa(1, { status_changed_at: ontem }) }, {}],
      profiles: [{ data: [] }, { data: [] }],
      task_view_groups: [{ data: [] }],
    });
    const t = await buscar(db, 1, HOJE);
    expect(t?.status).toBe('REVISAO');
    expect(t?.auto_review_reason).toBe('Tarefa não concluída - Remanejar');
    expect(gravacoes[0].valor).toMatchObject({ status: 'REVISAO', auto_review_reason: 'Tarefa não concluída - Remanejar' });
  });
});

describe('listar', () => {
  it('projeto específico: uma consulta só, sem grupos vinculados', async () => {
    const { db, from } = dbRoteiro({
      todos: [{ data: [tarefa(1, { project_id: 5 })] }],
      profiles: [{ data: [] }, { data: [] }],
    });
    const lista = await listar(db, 'u1', { projetoId: 5, hoje: HOJE });
    expect(lista.map(t => t.id)).toEqual([1]);
    expect(lista[0].linked_view_group_ids).toBeUndefined();
    expect(from.mock.calls.map(c => c[0])).not.toContain('task_view_groups');
  });

  it('junta pessoais, dono, membro e compartilhadas, sem repetir, da mais nova para a mais antiga', async () => {
    const { db } = dbRoteiro({
      project_members: [{ data: [{ project_id: 20 }] }],
      projects: [{ data: [{ id: 10 }] }],
      todos: [
        { data: [tarefa(1, { created_at: '2026-10-01T00:00:00Z' })] },          // pessoais
        { data: [tarefa(2, { created_at: '2026-10-03T00:00:00Z' })] },          // dono
        { data: [tarefa(3, { created_at: '2026-10-02T00:00:00Z' })] },          // membro
        { data: [tarefa(1, { created_at: '2026-10-01T00:00:00Z' }), tarefa(4, { created_at: '2026-10-04T00:00:00Z' })] }, // pasta compartilhada (1 repete)
        { data: [tarefa(5, { created_at: '2026-10-05T00:00:00Z' })] },          // tarefa compartilhada
      ],
      section_shares: [{ data: [{ section_id: 9 }] }],
      task_shares: [{ data: [{ task_id: 5 }] }],
      task_view_groups: [{ data: [] }],
      profiles: [{ data: [] }, { data: [] }],
    });
    const lista = await listar(db, 'u1', { hoje: HOJE });
    expect(lista.map(t => t.id)).toEqual([5, 4, 2, 3, 1]);
    expect(lista[0].linked_view_group_ids).toEqual([]);
  });

  it('sem projetos nem compartilhamentos: só as pessoais', async () => {
    const { db } = dbRoteiro({
      project_members: [{ data: [] }],
      projects: [{ data: [] }],
      todos: [{ data: [tarefa(1)] }],
      section_shares: [{ data: [] }],
      task_shares: [{ data: [] }],
      task_view_groups: [{ data: [] }],
      profiles: [{ data: [] }, { data: [] }],
    });
    expect((await listar(db, 'u1', { hoje: HOJE })).map(t => t.id)).toEqual([1]);
  });
});

describe('aguardando', () => {
  it('lista as delegadas com o nome do responsável', async () => {
    const { db } = dbRoteiro({
      todos: [{ data: [tarefa(1, { status: 'AGUARDANDO', assignee_id: 'p2' })] }],
      profiles: [{ data: [{ id: 'p2', full_name: 'Bia', email: null }] }],
    });
    expect((await aguardando(db, 'u1'))[0].assignee_name).toBe('Bia');
  });
});

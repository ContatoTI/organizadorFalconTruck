import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toISODate } from '@/src/lib/planning';
import { taskAPI } from './clienteTarefas';

const resposta = (corpo: unknown, status = 200) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status });

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(async () => resposta(null, 204));
  vi.stubGlobal('fetch', fetchFalso);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('taskAPI (tela)', () => {
  it('listar manda o hoje local e os filtros; erro vira vazio', async () => {
    fetchFalso.mockImplementationOnce(async () => resposta([{ id: 1 }]));
    expect(await taskAPI.getUserTasks({ projectId: 5, showCompleted: true })).toEqual([{ id: 1 }]);
    const url = String(fetchFalso.mock.calls[0][0]);
    expect(url).toContain(`hoje=${toISODate(new Date())}`);
    expect(url).toContain('projetoId=5');
    expect(url).toContain('concluidas=1');

    fetchFalso.mockImplementationOnce(async () => resposta({ erro: 'x' }, 500));
    expect(await taskAPI.getUserTasks()).toEqual([]);
  });

  it('criar devolve a tarefa; erro vira success false', async () => {
    fetchFalso.mockImplementationOnce(async () => resposta({ id: 9 }, 201));
    expect(await taskAPI.createTask('X', 5, undefined, undefined, undefined, 'd', undefined, 'EM_ANDAMENTO'))
      .toEqual({ success: true, data: { id: 9 } });
    expect(JSON.parse(String(fetchFalso.mock.calls[0][1].body))).toMatchObject({
      title: 'X', projectId: 5, description: 'd', status: 'EM_ANDAMENTO',
    });

    fetchFalso.mockImplementationOnce(async () => resposta({ erro: 'Título não pode estar vazio' }, 400));
    expect(await taskAPI.createTaskFrom({ title: '' })).toEqual({ success: false, error: 'Título não pode estar vazio' });
  });

  it('concluir devolve o novo estado', async () => {
    expect(await taskAPI.toggleTaskCompletion(7, false)).toEqual({ success: true, newState: true });
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ concluida: true });
  });

  it('mover usa destino explícito; reordenar manda o contexto', async () => {
    await taskAPI.moveTaskToGroup(7, null);
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ destino: 'grupo', grupoId: null });
    await taskAPI.moveTaskToProject(7, 5, 2);
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ destino: 'projeto', projetoId: 5, pastaId: 2 });
    await taskAPI.moveTaskAndReorder(7, 2, 1, 10);
    expect(fetchFalso.mock.lastCall?.[0]).toBe('/api/tarefas/7/reordenar');
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ pastaId: 2, indice: 1, projetoId: 10, grupoId: null });
  });

  it('grupos: vincular, tirar do grupo (direto) e só desvincular', async () => {
    await taskAPI.linkTaskToGroup(7, 3);
    expect(fetchFalso.mock.lastCall?.[0]).toBe('/api/tarefas/7/grupos/3');
    await taskAPI.removeTaskFromGroup(7, 3);
    expect(fetchFalso.mock.lastCall?.[0]).toBe('/api/tarefas/7/grupos/3?direto=1');
    await taskAPI.unlinkTaskFromGroup(7, 3);
    expect(fetchFalso.mock.lastCall).toEqual(['/api/tarefas/7/grupos/3', { method: 'DELETE' }]);
  });

  it('adiar converte a âncora para o dia no fuso local', async () => {
    const ancora = new Date(2026, 10, 2, 23, 30); // 2 de novembro, 23h30 local
    await taskAPI.deferTask(7, 'month', ancora);
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ horizonte: 'month', planDate: '2026-11-02' });
    await taskAPI.deferTask(7, null, null);
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ horizonte: null, planDate: null });
  });

  it('delegar e repetição', async () => {
    await taskAPI.delegateTask(7, null);
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ responsavelId: null });
    await taskAPI.setRecurrence(7, { freq: 'weekly', weekdays: [2], interval: 1, until: null, count: null });
    expect(fetchFalso.mock.lastCall?.[0]).toBe('/api/tarefas/7/repeticao');
  });
});

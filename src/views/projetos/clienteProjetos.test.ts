import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectAPI, sectionAPI } from './clienteProjetos';

const resposta = (corpo: unknown, status = 200) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status });

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(async () => resposta(null, 204));
  vi.stubGlobal('fetch', fetchFalso);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('projectAPI (tela)', () => {
  it('cria projeto mandando as pastas iniciais', async () => {
    fetchFalso.mockImplementationOnce(async () => resposta({ id: 9 }, 201));
    expect(await projectAPI.createProject('Obra', '#111', ['A'])).toEqual({ success: true, data: { id: 9 } });
    expect(JSON.parse(String(fetchFalso.mock.calls[0][1].body))).toEqual({ nome: 'Obra', cor: '#111', pastas: ['A'] });
  });

  it('sem permissão vira success false com a mensagem', async () => {
    fetchFalso.mockImplementationOnce(async () => resposta({ erro: 'Você não tem permissão para editar este projeto.' }, 403));
    expect(await projectAPI.updateProject(1, { name: 'X' }))
      .toEqual({ success: false, error: 'Você não tem permissão para editar este projeto.' });
  });

  it('dono/membro vêm de uma chamada só', async () => {
    fetchFalso.mockImplementation(async () => resposta({ dono: false, membro: true }));
    expect(await projectAPI.isProjectOwner(1)).toBe(false);
    expect(await projectAPI.isProjectMember(1)).toBe(true);
    expect(fetchFalso.mock.calls[0][0]).toBe('/api/projetos/1/acesso');
  });

  it('erros de leitura viram vazio', async () => {
    fetchFalso.mockImplementation(async () => resposta({ erro: 'x' }, 500));
    expect(await projectAPI.getUserProjects()).toEqual([]);
    expect(await projectAPI.getMembersAndInvites(1)).toEqual({ membros: [], pendentes: [] });
    expect(await projectAPI.getAccess(1)).toEqual({ dono: false, membro: false });
  });

  it('convites nas rotas certas', async () => {
    await projectAPI.inviteUserToProject(5, 'p2');
    expect(fetchFalso).toHaveBeenLastCalledWith('/api/projetos/5/convites/p2', { method: 'PUT' });
    await projectAPI.reinvite(5, 'p2');
    expect(fetchFalso).toHaveBeenLastCalledWith('/api/projetos/5/convites/p2/reenviar', { method: 'POST' });
  });
});

describe('sectionAPI (tela)', () => {
  it('reordenar e mover usam a mesma rota', async () => {
    await sectionAPI.reorderSections(7, 2);
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ indice: 2 });
    await sectionAPI.moveSectionToProject(7, 9);
    expect(fetchFalso.mock.lastCall?.[0]).toBe('/api/projetos/pastas/7/mover');
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ projetoId: 9 });
  });
});

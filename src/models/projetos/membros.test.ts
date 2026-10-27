import { describe, it, expect } from 'vitest';
import { dbRoteiro } from '@/src/lib/testes/dbRoteiro';
import {
  listarMembros, convitesPendentes, convidar, cancelarConvitePendente, reconvidar,
  apagarConviteRecusado, removerMembro,
} from './membros';

describe('membros e convites', () => {
  it('lista membros e pendentes', async () => {
    const { db } = dbRoteiro({
      project_members: [{ data: [{ id: 1, user_id: 'p1' }] }],
      project_invites: [{ data: [{ invited_user_id: 'p2' }] }],
    });
    expect(await listarMembros(db, 5)).toEqual([{ id: 1, project_id: 5, user_id: 'p1' }]);
    expect(await convitesPendentes(db, 5)).toEqual(['p2']);
  });

  it('convida quem ainda não é membro nem tem convite', async () => {
    const { db, gravacoes } = dbRoteiro({ project_members: [{ data: null }], project_invites: [{ data: null }, {}] });
    await convidar(db, 5, 'p2', 'u1');
    expect(gravacoes[0].valor).toEqual({ project_id: 5, invited_user_id: 'p2', invited_by_user_id: 'u1', status: 'pending' });
  });

  it('não duplica membro nem convite', async () => {
    await expect(convidar(dbRoteiro({ project_members: [{ data: { id: 1 } }] }).db, 5, 'p2', 'u1'))
      .rejects.toThrow(/já é membro/);
    await expect(convidar(dbRoteiro({ project_members: [{ data: null }], project_invites: [{ data: { id: 9 } }] }).db, 5, 'p2', 'u1'))
      .rejects.toThrow(/pendente já existe/);
  });

  it('cancelar só o pendente; reconvidar apaga o antigo e convida', async () => {
    const a = dbRoteiro({});
    await cancelarConvitePendente(a.db, 5, 'p2');
    expect(a.gravacoes[0].filtros).toEqual([['project_id', 5], ['invited_user_id', 'p2'], ['status', 'pending']]);

    const b = dbRoteiro({ project_invites: [{}, { data: null }, {}], project_members: [{ data: null }] });
    await reconvidar(b.db, 5, 'p2', 'u1');
    expect(b.gravacoes.map(g => g.op)).toEqual(['delete', 'insert']);
  });

  it('apaga só convite recusado', async () => {
    const { db, gravacoes } = dbRoteiro({});
    await apagarConviteRecusado(db, 8);
    expect(gravacoes[0].filtros).toEqual([['id', 8], ['status', 'declined']]);
  });

  it('só o dono remove membro', async () => {
    await expect(removerMembro(dbRoteiro({ projects: [{ data: { owner_id: 'outro' } }] }).db, 5, 'p2', 'u1'))
      .rejects.toThrow(/Apenas o dono/);
    await expect(removerMembro(dbRoteiro({ projects: [{ data: { owner_id: 'u1' } }], project_members: [{ data: null }] }).db, 5, 'p2', 'u1'))
      .rejects.toThrow(/não encontrado/);
    const ok = dbRoteiro({ projects: [{ data: { owner_id: 'u1' } }], project_members: [{ data: { id: 3 } }, {}] });
    await removerMembro(ok.db, 5, 'p2', 'u1');
    expect(ok.gravacoes[0]).toMatchObject({ tabela: 'project_members', op: 'delete', filtros: [['id', 3]] });
  });
});

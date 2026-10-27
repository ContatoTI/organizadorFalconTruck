import { describe, it, expect } from 'vitest';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import { dbRoteiro } from '@/src/lib/testes/dbRoteiro';
import { ErroValidacao } from '@/src/lib/erros';
import {
  validarNovoAviso, convitesERecusas, aceitarConvite, recusarConvite,
  avisosNaoLidos, criarAviso, dispensarAviso, resolverRevisao,
} from './notificacoes';

describe('validarNovoAviso', () => {
  it('normaliza e aplica tipo padrão', () => {
    expect(validarNovoAviso({ userId: 'u2', taskId: 3, taskTitle: 'T', senderName: 'Ana' })).toEqual({
      userId: 'u2', taskId: 3, taskTitle: 'T', senderName: 'Ana', type: 'review', note: null,
    });
  });
  it('recusa tarefa, tipo ou destinatário inválidos', () => {
    expect(() => validarNovoAviso({ userId: 'u2', taskId: 'x', taskTitle: 'T' })).toThrow(ErroValidacao);
    expect(() => validarNovoAviso({ userId: 'u2', taskId: 3, taskTitle: 'T', type: 'spam' })).toThrow(/Tipo/);
    expect(() => validarNovoAviso({ userId: '', taskId: 3, taskTitle: 'T' })).toThrow(/destinatário/);
  });
});

describe('convites', () => {
  it('monta pendentes e recusas com nomes', async () => {
    const { db } = dbRoteiro({
      projects: [{ data: [{ id: 10 }] }],
      project_members: [{ data: [{ project_id: 20 }] }],
      project_invites: [
        { data: [{ id: 1, project_id: 30, invited_by_user_id: 'p1', created_at: 'd1', projects: { name: 'Obra', color: '#111' } }] },
        { data: [{ id: 2, project_id: 10, invited_user_id: 'p2', created_at: 'd2', projects: null }] },
      ],
      profiles: [{ data: [{ id: 'p1', full_name: 'Ana', email: 'a@x' }, { id: 'p2', full_name: 'Bia' }] }],
    });
    expect(await convitesERecusas(db, 'u1')).toEqual({
      pendingInvites: [{ id: 1, project_id: 30, project_title: 'Obra', project_color: '#111', inviter_name: 'Ana', inviter_email: 'a@x', created_at: 'd1' }],
      declineNotifications: [{ id: 2, project_id: 10, project_title: 'Projeto', project_color: '#6366f1', declined_user_name: 'Bia', invited_user_id: 'p2', created_at: 'd2' }],
    });
  });

  it('aceitar: entra no projeto do convite e marca aceito', async () => {
    const { db, gravacoes } = dbRoteiro({
      project_invites: [{ data: { id: 1, status: 'pending', project_id: 30 } }, {}],
      project_members: [{ data: null }, {}],
    });
    await aceitarConvite(db, 'u1', 1);
    expect(gravacoes.map(g => [g.tabela, g.op, g.valor])).toEqual([
      ['project_members', 'insert', { project_id: 30, user_id: 'u1' }],
      ['project_invites', 'update', { status: 'accepted' }],
    ]);
  });

  it('aceitar: já membro não duplica', async () => {
    const { db, gravacoes } = dbRoteiro({
      project_invites: [{ data: { id: 1, status: 'pending', project_id: 30 } }, {}],
      project_members: [{ data: { id: 9 } }],
    });
    await aceitarConvite(db, 'u1', 1);
    expect(gravacoes.map(g => g.op)).toEqual(['update']);
  });

  it('aceitar: convite de outro ou já usado é recusado', async () => {
    await expect(aceitarConvite(dbRoteiro({ project_invites: [{ data: null }] }).db, 'u1', 1))
      .rejects.toThrow(/não encontrado/);
    await expect(aceitarConvite(dbRoteiro({ project_invites: [{ data: { status: 'accepted' } }] }).db, 'u1', 1))
      .rejects.toThrow(/já foi processado/);
  });

  it('recusar só o próprio convite', async () => {
    const { db, chamadas } = dbFalso();
    await recusarConvite(db, 'u1', 4);
    expect(chamadas.update[0][0]).toEqual({ status: 'declined' });
    expect(chamadas.eq).toEqual([['id', 4], ['invited_user_id', 'u1']]);
  });
});

describe('avisos de tarefa', () => {
  it('lista só não lidos do usuário', async () => {
    const { db, chamadas } = dbFalso({ data: [] });
    await avisosNaoLidos(db, 'u1');
    expect(chamadas.eq).toEqual([['user_id', 'u1'], ['is_read', false]]);
  });

  it('cria e dispensa', async () => {
    const a = dbFalso();
    await criarAviso(a.db, { userId: 'u2', taskId: 3, taskTitle: 'T', senderName: 'Ana', type: 'assigned', note: null });
    expect(a.chamadas.insert[0][0]).toEqual({ user_id: 'u2', task_id: 3, task_title: 'T', sender_name: 'Ana', type: 'assigned', note: null });
    const b = dbFalso();
    await dispensarAviso(b.db, 'u1', 7);
    expect(b.chamadas.eq).toEqual([['id', 7], ['user_id', 'u1']]);
  });

  it('resolver revisão: aprova, avisa responsável e dono sem repetir e apaga o aviso', async () => {
    const { db, gravacoes } = dbRoteiro({
      todos: [{ data: { user_id: 'criador', assignee_id: 'resp', project_id: 5, title: 'T' } }, {}],
      projects: [{ data: { owner_id: 'dono' } }],
      task_review_notifications: [{}, {}, {}],
    });
    await resolverRevisao(db, { id: 'revisor', nome: 'Rev' }, 99, 3, true);
    expect(gravacoes.map(g => [g.tabela, g.op])).toEqual([
      ['todos', 'update'],
      ['task_review_notifications', 'insert'],
      ['task_review_notifications', 'insert'],
      ['task_review_notifications', 'delete'],
    ]);
    expect(gravacoes[0].valor).toEqual({ status: 'CONCLUIDO', is_completed: true });
    expect(gravacoes.slice(1, 3).map(g => (g.valor as { user_id: string }).user_id)).toEqual(['resp', 'dono']);
  });

  it('reprovar sem observação usa a padrão e não avisa o próprio revisor', async () => {
    const { db, gravacoes } = dbRoteiro({
      todos: [{ data: { user_id: 'revisor', assignee_id: null, project_id: null, title: 'T' } }, {}],
      task_review_notifications: [{}],
    });
    await resolverRevisao(db, { id: 'revisor', nome: 'Rev' }, 99, 3, false);
    expect(gravacoes[0].valor).toEqual({ status: 'EM_ANDAMENTO', is_completed: false });
    expect(gravacoes.map(g => g.op)).toEqual(['update', 'delete']);
  });

  it('tarefa inexistente é recusada', async () => {
    await expect(resolverRevisao(dbRoteiro({ todos: [{ data: null }] }).db, { id: 'r', nome: 'R' }, 1, 3, true))
      .rejects.toThrow(/Tarefa não encontrada/);
  });
});

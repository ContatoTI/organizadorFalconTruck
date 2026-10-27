import { describe, it, expect, beforeEach } from 'vitest';
import { dbRoteiro } from '@/src/lib/testes/dbRoteiro';
import { ErroValidacao } from '@/src/lib/erros';
import {
  validarNova, validarAlteracao, validarHorizonte, validarRepeticao,
  criar, atualizar, concluir, excluir, adiar, delegar, repetir, _reiniciarColunasAusentes,
} from './escrita';

const UID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => _reiniciarColunasAusentes());

describe('validação', () => {
  it('nova tarefa: limpa título e normaliza o resto', () => {
    expect(validarNova({ title: ' Ligar ', projectId: 5, recur: { freq: 'weekly', weekdays: [2, 9] } }))
      .toMatchObject({ title: 'Ligar', projectId: 5, recur: { freq: 'weekly', weekdays: [2] }, status: null });
  });
  it('recusa título vazio, data, horário, repetição e responsável inválidos', () => {
    expect(() => validarNova({ title: '  ' })).toThrow('Título não pode estar vazio');
    expect(() => validarNova({ title: 'X', dueDate: '27/10' })).toThrow(/Data/);
    expect(() => validarNova({ title: 'X', dueAt: 'ontem' })).toThrow(/Horário/);
    expect(() => validarNova({ title: 'X', recur: { freq: 'sempre' } })).toThrow(/Repetição/);
    expect(() => validarNova({ title: 'X', assigneeId: 'abc' })).toThrow(/Responsável/);
  });
  it('alteração só passa colunas permitidas', () => {
    expect(validarAlteracao({ title: ' Y ', user_id: 'hack', created_at: 'x', position: 3 }))
      .toEqual({ title: 'Y', position: 3 });
    expect(() => validarAlteracao({ user_id: 'hack' })).toThrow(/Nada/);
  });
  it('horizonte e repetição', () => {
    expect(validarHorizonte('month')).toBe('month');
    expect(() => validarHorizonte('decade')).toThrow(ErroValidacao);
    expect(validarRepeticao({ freq: 'weekly', weekdays: [1, 3], interval: 2 }))
      .toEqual({ freq: 'weekly', weekdays: [1, 3], interval: 2, until: null, count: null });
    expect(validarRepeticao({ freq: null })).toMatchObject({ freq: null });
  });
});

describe('criar', () => {
  it('na pasta: posição no fim e registro completo', async () => {
    const { db, gravacoes } = dbRoteiro({ todos: [{ data: { position: 4 } }, { data: { id: 9 } }] });
    await criar(db, 'u1', validarNova({ title: 'X', projectId: 5, sectionId: 3, description: 'd', priority: 'alta' }));
    expect(gravacoes[0].op).toBe('insert');
    expect(gravacoes[0].valor).toMatchObject({
      user_id: 'u1', title: 'X', project_id: 5, section_id: 3, position: 5,
      is_completed: false, status: 'A_FAZER', description: 'd', priority: 'alta',
    });
  });

  it('status vindo do kanban é respeitado', async () => {
    const { db, gravacoes } = dbRoteiro({ todos: [{ data: null }, { data: { id: 9 } }] });
    await criar(db, 'u1', validarNova({ title: 'X', projectId: 5, status: 'EM_ANDAMENTO' }));
    expect(gravacoes[0].valor).toMatchObject({ status: 'EM_ANDAMENTO', position: 0 });
  });

  it('repetição semanal grava a regra', async () => {
    const { db, gravacoes } = dbRoteiro({ todos: [{ data: null }, { data: { id: 9 } }] });
    await criar(db, 'u1', validarNova({ title: 'X', recur: { freq: 'weekly', weekdays: [2, 4] } }));
    expect(gravacoes[0].valor).toMatchObject({ recur_freq: 'weekly', recur_interval: 1, recur_weekdays: [2, 4] });
  });

  it('banco sem duration_min: refaz sem a coluna e lembra', async () => {
    const erroColuna = { error: { code: '42703', message: 'column "duration_min" does not exist' } };
    const { db, gravacoes } = dbRoteiro({ todos: [{ data: null }, erroColuna, { data: { id: 9 } }] });
    await criar(db, 'u1', validarNova({ title: 'X', durationMin: 30 }));
    expect(gravacoes).toHaveLength(2);
    expect(gravacoes[0].valor).toHaveProperty('duration_min');
    expect(gravacoes[1].valor).not.toHaveProperty('duration_min');

    // Próximo criar nem tenta a coluna.
    const depois = dbRoteiro({ todos: [{ data: null }, { data: { id: 10 } }] });
    await criar(depois.db, 'u1', validarNova({ title: 'Y', durationMin: 30 }));
    expect(depois.gravacoes[0].valor).not.toHaveProperty('duration_min');
  });

  it('banco sem repetição: cria sem repetir em vez de perder a tarefa', async () => {
    const erroColuna = { error: { code: '42703', message: 'column "recur_freq" does not exist' } };
    const { db, gravacoes } = dbRoteiro({ todos: [{ data: null }, erroColuna, { data: { id: 9 } }] });
    await criar(db, 'u1', validarNova({ title: 'X', recur: { freq: 'daily', weekdays: [] } }));
    expect(gravacoes[1].valor).not.toHaveProperty('recur_freq');
  });

  it('outro erro sobe', async () => {
    const { db } = dbRoteiro({ todos: [{ data: null }, { error: { message: 'negado' } }] });
    await expect(criar(db, 'u1', validarNova({ title: 'X' }))).rejects.toThrow('negado');
  });
});

describe('atualizar', () => {
  it('mudar status zera o relógio e limpa a etiqueta da revisão automática', async () => {
    const { db, gravacoes } = dbRoteiro({});
    await atualizar(db, 7, { status: 'EM_ANDAMENTO' });
    expect(gravacoes[0].valor).toMatchObject({
      status: 'EM_ANDAMENTO', status_changed_at: expect.any(String), auto_review_reason: null,
    });
  });
  it('mandar para revisão não limpa a etiqueta', async () => {
    const { db, gravacoes } = dbRoteiro({});
    await atualizar(db, 7, { status: 'REVISAO' });
    expect(gravacoes[0].valor).not.toHaveProperty('auto_review_reason');
  });
  it('sem status não mexe no relógio', async () => {
    const { db, gravacoes } = dbRoteiro({});
    await atualizar(db, 7, { title: 'Z' });
    expect(gravacoes[0].valor).toEqual({ title: 'Z' });
  });
});

describe('concluir e excluir', () => {
  it('concluir e reabrir', async () => {
    const a = dbRoteiro({});
    await concluir(a.db, 7, true);
    expect(a.gravacoes[0].valor).toMatchObject({ is_completed: true, status: 'CONCLUIDO' });
    const b = dbRoteiro({});
    await concluir(b.db, 7, false);
    expect(b.gravacoes[0].valor).toMatchObject({ is_completed: false, status: 'A_FAZER' });
  });

  it('criador exclui (vai para a lixeira)', async () => {
    const { db, gravacoes } = dbRoteiro({ todos: [{ data: { user_id: UID, project_id: null } }, {}] });
    await excluir(db, UID, 7);
    expect(gravacoes[0].valor).toEqual({ deleted_at: expect.any(String) });
  });

  it('dono e membro do projeto podem excluir', async () => {
    const dono = dbRoteiro({
      todos: [{ data: { user_id: 'outro', project_id: 5 } }, {}],
      projects: [{ data: { owner_id: UID } }],
    });
    await expect(excluir(dono.db, UID, 7)).resolves.toBeUndefined();

    const membro = dbRoteiro({
      todos: [{ data: { user_id: 'outro', project_id: 5 } }, {}],
      projects: [{ data: { owner_id: 'outro' } }],
      project_members: [{ data: { id: 1 } }],
    });
    await expect(excluir(membro.db, UID, 7)).resolves.toBeUndefined();
  });

  it('quem é de fora não exclui', async () => {
    const { db, gravacoes } = dbRoteiro({
      todos: [{ data: { user_id: 'outro', project_id: 5 } }],
      projects: [{ data: { owner_id: 'outro' } }],
      project_members: [{ data: null }],
    });
    await expect(excluir(db, UID, 7)).rejects.toThrow(/Apenas o criador ou membros/);
    expect(gravacoes).toHaveLength(0);
  });

  it('tarefa inexistente', async () => {
    await expect(excluir(dbRoteiro({ todos: [{ data: null }] }).db, UID, 7)).rejects.toThrow(/não encontrada/);
  });
});

describe('adiar, delegar e repetir', () => {
  it('adiar grava o horizonte e limpa o horário; voltar limpa tudo', async () => {
    const a = dbRoteiro({});
    await adiar(a.db, 7, 'month', '2026-11-01');
    expect(a.gravacoes[0].valor).toEqual({ plan_horizon: 'month', plan_date: '2026-11-01', due_at: null });
    const b = dbRoteiro({});
    await adiar(b.db, 7, null, null);
    expect(b.gravacoes[0].valor).toEqual({ plan_horizon: null, plan_date: null });
  });

  it('banco sem a migração de planejamento avisa com mensagem clara', async () => {
    const { db } = dbRoteiro({ todos: [{ error: { code: '42703', message: 'column "plan_horizon" missing' } }] });
    await expect(adiar(db, 7, 'day', '2026-10-28')).rejects.toThrow(/migracao de planejamento/);
  });

  it('delegar marca aguardando; devolver limpa', async () => {
    const a = dbRoteiro({});
    await delegar(a.db, 7, UID);
    expect(a.gravacoes[0].valor).toMatchObject({ assignee_id: UID, status: 'AGUARDANDO', delegated_at: expect.any(String) });
    const b = dbRoteiro({});
    await delegar(b.db, 7, null);
    expect(b.gravacoes[0].valor).toEqual({ assignee_id: null, status: 'A_FAZER', delegated_at: null });
    await expect(delegar(dbRoteiro({}).db, 7, 'abc')).rejects.toThrow(/Responsável/);
  });

  it('repetir grava a regra; tirar limpa', async () => {
    const a = dbRoteiro({});
    await repetir(a.db, 7, validarRepeticao({ freq: 'weekly', weekdays: [2], interval: 2, until: '2026-12-31' }));
    expect(a.gravacoes[0].valor).toEqual({
      recur_freq: 'weekly', recur_interval: 2, recur_weekdays: [2], recur_until: '2026-12-31', recur_count: null,
    });
    const b = dbRoteiro({});
    await repetir(b.db, 7, validarRepeticao({ freq: null }));
    expect(b.gravacoes[0].valor).toEqual({
      recur_freq: null, recur_interval: 1, recur_weekdays: null, recur_until: null, recur_count: null,
    });
  });
});

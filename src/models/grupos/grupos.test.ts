import { describe, it, expect } from 'vitest';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import { ErroValidacao } from '@/src/lib/erros';
import { montarDadosGrupo, validarDados, listar, criar, atualizar, excluir, type FormularioGrupo } from './grupos';

const form: FormularioGrupo = {
  title: 'Manhã', type: 'time', icon: '', color: '#fff', start_time: '08:00', end_time: '12:00',
  recurrence_type: 'weekly', recurrence_days: [1, 2], schedules: [], show_on_dashboard: true,
};

describe('montarDadosGrupo', () => {
  it('bloco mantém horários; horário por dia vazio vira null', () => {
    expect(montarDadosGrupo(form)).toEqual({
      title: 'Manhã', type: 'time', icon: null, color: '#fff', start_time: '08:00', end_time: '12:00',
      recurrence_type: 'weekly', recurrence_days: [1, 2], schedules: null, show_on_dashboard: true,
    });
  });
  it('lista zera os campos de horário', () => {
    expect(montarDadosGrupo({ ...form, type: 'list', schedules: [{ day: 1, start: '08:00', end: '09:00' }] }))
      .toMatchObject({ start_time: null, end_time: null, recurrence_type: null, recurrence_days: null, schedules: null });
  });
});

describe('validarDados', () => {
  it('criação exige título e tipo', () => {
    expect(() => validarDados({ type: 'list' }, true)).toThrow(/nome/);
    expect(() => validarDados({ title: 'X', type: 'outro' }, true)).toThrow(/Tipo/);
  });
  it('alteração parcial só passa campos permitidos', () => {
    expect(validarDados({ show_on_dashboard: false, user_id: 'hack' })).toEqual({ show_on_dashboard: false });
  });
  it('recusa vazio e visibilidade inválida', () => {
    expect(() => validarDados({ id: 1 })).toThrow(ErroValidacao);
    expect(() => validarDados({ show_on_dashboard: 'sim' })).toThrow(/Visibilidade/);
  });
});

describe('banco', () => {
  it('lista do usuário na ordem pedida', async () => {
    const { db, chamadas } = dbFalso({ data: [] });
    await listar(db, 'u1', 'title');
    expect(chamadas.eq).toEqual([['user_id', 'u1']]);
    expect(chamadas.order).toEqual([['title']]);
  });

  it('cria com o dono', async () => {
    const { db, chamadas } = dbFalso({ data: { id: 1 } });
    await criar(db, 'u1', { title: 'X', type: 'list' });
    expect(chamadas.insert[0][0]).toEqual({ title: 'X', type: 'list', user_id: 'u1' });
  });

  it('altera só do usuário', async () => {
    const { db, chamadas } = dbFalso();
    await atualizar(db, 'u1', 3, { color: '#000' });
    expect(chamadas.eq).toEqual([['id', 3], ['user_id', 'u1']]);
  });

  it('excluir solta as tarefas antes de apagar', async () => {
    const { db, from, chamadas } = dbFalso();
    await excluir(db, 'u1', 3);
    expect(from.mock.calls.map(c => c[0])).toEqual(['todos', 'view_groups']);
    expect(chamadas.update[0][0]).toEqual({ view_group_id: null });
    expect(chamadas.eq).toEqual([['view_group_id', 3], ['id', 3], ['user_id', 'u1']]);
  });

  it('erro ao soltar tarefas impede a exclusão', async () => {
    const { db, from } = dbFalso({ error: { message: 'falhou' } });
    await expect(excluir(db, 'u1', 3)).rejects.toThrow('falhou');
    expect(from).toHaveBeenCalledTimes(1);
  });
});

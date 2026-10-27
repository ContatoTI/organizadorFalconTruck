import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import { ErroValidacao } from '@/src/lib/erros';
import {
  validarHorario, validarEstado, validarData, agendar, agendarDiaInteiro,
  ocorrencias, marcarOcorrencia, _reiniciarColunaDuracao,
} from './agenda';

beforeEach(() => _reiniciarColunaDuracao());

/** Banco que recusa a 1ª gravação com "coluna não existe" e aceita a 2ª. */
function dbSemColunaDuracao() {
  const gravacoes: unknown[] = [];
  let tentativa = 0;
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    q.update = (v: unknown) => { gravacoes.push({ ...(v as object) }); return q; };
    q.eq = () => q;
    q.then = (ok: (v: unknown) => unknown) =>
      ok({ error: tentativa++ === 0 ? { code: '42703', message: 'column duration_min does not exist' } : null });
    return q;
  });
  return { db: { from } as unknown as SupabaseClient, gravacoes };
}

describe('validação', () => {
  it('horário com data e duração', () => {
    expect(validarHorario({ dueAt: '2026-10-27T13:00:00.000Z', dueDate: '2026-10-27', durationMin: 30 }))
      .toEqual({ dueAt: '2026-10-27T13:00:00.000Z', dueDate: '2026-10-27', durationMin: 30 });
  });
  it('tirar da agenda: tudo null, sem mexer na duração', () => {
    expect(validarHorario({ dueAt: null })).toEqual({ dueAt: null, dueDate: null });
  });
  it('recusa horário, data ou duração inválidos', () => {
    expect(() => validarHorario({ dueAt: 'ontem', dueDate: '2026-10-27' })).toThrow(/Horário/);
    expect(() => validarHorario({ dueAt: '2026-10-27T13:00:00Z', dueDate: '27/10' })).toThrow(/Data/);
    expect(() => validarHorario({ dueAt: '2026-10-27T13:00:00Z', dueDate: '2026-10-27', durationMin: -5 })).toThrow(/Duração/);
  });
  it('estado da ocorrência', () => {
    expect(validarEstado({ completed: true, outro: 1 })).toEqual({ completed: true });
    expect(() => validarEstado({})).toThrow(ErroValidacao);
    expect(() => validarData('2026-1-1')).toThrow(ErroValidacao);
  });
});

describe('agendar', () => {
  it('grava horário, dia e duração', async () => {
    const { db, chamadas } = dbFalso();
    await agendar(db, 5, { dueAt: '2026-10-27T13:00:00.000Z', dueDate: '2026-10-27', durationMin: 45 });
    expect(chamadas.update[0][0]).toEqual({ due_at: '2026-10-27T13:00:00.000Z', due_date: '2026-10-27', duration_min: 45 });
    expect(chamadas.eq).toEqual([['id', 5]]);
  });

  it('sem durationMin não mexe na duração', async () => {
    const { db, chamadas } = dbFalso();
    await agendar(db, 5, { dueAt: null, dueDate: null });
    expect(chamadas.update[0][0]).toEqual({ due_at: null, due_date: null });
  });

  it('dia inteiro limpa horário e duração numa escrita só', async () => {
    const { db, chamadas } = dbFalso();
    await agendarDiaInteiro(db, 5, '2026-10-28');
    expect(chamadas.update).toEqual([[{ due_at: null, due_date: '2026-10-28', duration_min: null }]]);
  });

  it('banco sem a coluna duration_min: tenta de novo sem ela e lembra', async () => {
    const { db, gravacoes } = dbSemColunaDuracao();
    await agendar(db, 5, { dueAt: null, dueDate: null, durationMin: 30 });
    expect(gravacoes).toEqual([
      { due_at: null, due_date: null, duration_min: 30 },
      { due_at: null, due_date: null },
    ]);
    const depois = dbFalso();
    await agendarDiaInteiro(depois.db, 5, '2026-10-28');
    expect(depois.chamadas.update[0][0]).toEqual({ due_at: null, due_date: '2026-10-28' });
  });

  it('outro erro sobe', async () => {
    const { db } = dbFalso({ error: { message: 'sem permissão' } });
    await expect(agendar(db, 5, { dueAt: null, dueDate: null })).rejects.toThrow('sem permissão');
  });
});

describe('ocorrências', () => {
  it('lista do usuário no período', async () => {
    const { db, chamadas } = dbFalso({ data: [] });
    await ocorrencias(db, 'u1', '2026-10-01', '2026-10-31');
    expect(chamadas.gte).toEqual([['occurrence_date', '2026-10-01']]);
    expect(chamadas.lte).toEqual([['occurrence_date', '2026-10-31']]);
  });

  it('marca uma data só da série', async () => {
    const { db, chamadas } = dbFalso();
    const agora = new Date('2026-10-27T12:00:00Z');
    await marcarOcorrencia(db, 'u1', 5, '2026-10-27', { completed: true }, agora);
    expect(chamadas.upsert[0]).toEqual([
      { user_id: 'u1', task_id: 5, occurrence_date: '2026-10-27', is_completed: true, completed_at: agora.toISOString() },
      { onConflict: 'task_id,occurrence_date' },
    ]);
  });
});

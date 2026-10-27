import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import { ErroValidacao } from '@/src/lib/erros';
import {
  validarTipo, validarUsuarioId, listarAcessos, compartilhar, descompartilhar,
  definirResponsavelPadrao, usuariosParaCompartilhar, pastasQueCompartilhei, pastasCompartilhadasComigo,
} from './compartilhamentos';

const UID = '11111111-1111-1111-1111-111111111111';

/** Banco falso que responde cada tabela com um resultado próprio. */
function dbPorTabela(respostas: Record<string, unknown>) {
  const consulta = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'neq', 'limit']) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown) => ok({ data, error: null });
    return q;
  };
  return { from: vi.fn((t: string) => consulta(respostas[t])) } as unknown as SupabaseClient;
}

describe('validação', () => {
  it('tipo pasta ou tarefa', () => {
    expect(validarTipo('pasta')).toBe('pasta');
    expect(() => validarTipo('projeto')).toThrow(ErroValidacao);
  });
  it('usuário precisa ser um id válido', () => {
    expect(validarUsuarioId(UID)).toBe(UID);
    expect(() => validarUsuarioId('x')).toThrow(ErroValidacao);
  });
});

describe('acessos', () => {
  it('lista acessos da pasta', async () => {
    const { db, from, chamadas } = dbFalso({ data: [{ user_id: UID }] });
    expect(await listarAcessos(db, 'pasta', 5)).toEqual([{ user_id: UID }]);
    expect(from).toHaveBeenCalledWith('section_shares');
    expect(chamadas.eq).toEqual([['section_id', 5]]);
  });

  it('compartilhar tarefa; já compartilhado não é erro', async () => {
    const a = dbFalso();
    await compartilhar(a.db, 'tarefa', 9, UID);
    expect(a.from).toHaveBeenCalledWith('task_shares');
    expect(a.chamadas.insert[0][0]).toEqual({ task_id: 9, user_id: UID });
    const b = dbFalso({ error: { message: 'dup', code: '23505' } as { message: string } });
    await expect(compartilhar(b.db, 'tarefa', 9, UID)).resolves.toBeUndefined();
    const c = dbFalso({ error: { message: 'negado' } });
    await expect(compartilhar(c.db, 'tarefa', 9, UID)).rejects.toThrow('negado');
  });

  it('descompartilhar remove só aquele usuário', async () => {
    const { db, chamadas } = dbFalso();
    await descompartilhar(db, 'pasta', 5, UID);
    expect(chamadas.eq).toEqual([['section_id', 5], ['user_id', UID]]);
  });

  it('responsável padrão também dá acesso à pasta', async () => {
    const { db, from, chamadas } = dbFalso();
    await definirResponsavelPadrao(db, 5, UID);
    expect(chamadas.update[0][0]).toEqual({ default_assignee_id: UID });
    expect(from.mock.calls.map(c => c[0])).toEqual(['sections', 'section_shares']);
  });

  it('remover responsável não mexe nos acessos', async () => {
    const { db, from } = dbFalso();
    await definirResponsavelPadrao(db, 5, null);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('usuários para compartilhar excluem você', async () => {
    const { db, chamadas } = dbFalso({ data: [] });
    await usuariosParaCompartilhar(db, UID);
    expect(chamadas.neq).toEqual([['id', UID]]);
    expect(chamadas.limit).toEqual([[50]]);
  });
});

describe('resumos', () => {
  it('pastas que compartilhei, com as pessoas', async () => {
    const db = dbPorTabela({
      sections: [{ id: 1, project_id: 10, title: 'A' }, { id: 2, project_id: 10, title: 'B' }],
      section_shares: [{ section_id: 1, user_id: 'p1' }, { section_id: 1, user_id: 'p2' }],
      projects: [{ id: 10, name: 'Proj' }],
      profiles: [{ id: 'p1', full_name: 'Ana' }, { id: 'p2', full_name: 'Bia' }],
    });
    expect(await pastasQueCompartilhei(db, UID)).toEqual([{
      section: { id: 1, project_id: 10, title: 'A' },
      project: { id: 10, name: 'Proj' },
      users: [{ id: 'p1', full_name: 'Ana' }, { id: 'p2', full_name: 'Bia' }],
    }]);
  });

  it('sem compartilhamentos devolve vazio', async () => {
    const db = dbPorTabela({ sections: [{ id: 1, project_id: 10 }], section_shares: [] });
    expect(await pastasQueCompartilhei(db, UID)).toEqual([]);
  });

  it('pastas compartilhadas comigo, com o dono', async () => {
    const db = dbPorTabela({
      section_shares: [{ section_id: 3 }],
      sections: [{ id: 3, project_id: 20, user_id: 'dono' }],
      projects: [{ id: 20, name: 'X' }],
      profiles: [{ id: 'dono', full_name: 'Carlos' }],
    });
    expect(await pastasCompartilhadasComigo(db, UID)).toEqual([{
      section: { id: 3, project_id: 20, user_id: 'dono' },
      project: { id: 20, name: 'X' },
      owner: { id: 'dono', full_name: 'Carlos' },
    }]);
  });
});

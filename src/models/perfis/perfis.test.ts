import { describe, it, expect } from 'vitest';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import { ErroValidacao } from '@/src/lib/erros';
import { lerIds, lerLimite, listar } from './perfis';

const UID = '11111111-1111-1111-1111-111111111111';

describe('filtros', () => {
  it('lê ids e limite', () => {
    expect(lerIds(`${UID},${UID}`)).toEqual([UID, UID]);
    expect(lerIds(null)).toBeUndefined();
    expect(lerLimite(null)).toBe(50);
    expect(lerLimite('500')).toBe(500);
  });
  it('recusa id ou limite inválido', () => {
    expect(() => lerIds('abc')).toThrow(ErroValidacao);
    expect(() => lerLimite('501')).toThrow(ErroValidacao);
    expect(() => lerLimite('0')).toThrow(ErroValidacao);
  });
});

describe('listar', () => {
  it('sem filtro usa o limite padrão', async () => {
    const { db, chamadas } = dbFalso({ data: [] });
    await listar(db);
    expect(chamadas.limit).toEqual([[50]]);
    expect(chamadas.in).toBeUndefined();
  });

  it('filtra por ids e deixa você de fora', async () => {
    const { db, chamadas } = dbFalso({ data: [{ id: UID }] });
    expect(await listar(db, { ids: [UID], excluirId: 'eu', limite: 10 })).toEqual([{ id: UID }]);
    expect(chamadas.in).toEqual([['id', [UID]]]);
    expect(chamadas.neq).toEqual([['id', 'eu']]);
    expect(chamadas.limit).toEqual([[10]]);
  });

  it('lista de ids vazia nem consulta', async () => {
    const { db, from } = dbFalso();
    expect(await listar(db, { ids: [] })).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});

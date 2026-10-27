import { describe, it, expect } from 'vitest';
import type { Goal, Task } from '@/types/index';
import { buildGoalTree, collectSubtreeIds, goalProgress, isDescendant, flattenTree } from './arvore';

const meta = (id: number, parent_id: number | null = null, position = 0) => ({ id, parent_id, position } as Goal);

// 1 ─┬─ 2 ── 4
//    └─ 3
// 5 (órfão de 99)
const metas = [meta(3, 1, 1), meta(1), meta(2, 1, 0), meta(4, 2), meta(5, 99, 1)];

describe('árvore de objetivos', () => {
  it('monta a árvore em ordem e com profundidade', () => {
    const [raiz, orfao] = buildGoalTree(metas);
    expect(raiz.id).toBe(1);
    expect(raiz.children.map(c => c.id)).toEqual([2, 3]);
    expect(raiz.children[0].children[0]).toMatchObject({ id: 4, depth: 2 });
    expect(orfao).toMatchObject({ id: 5, depth: 0 });
  });

  it('junta ids da sub-árvore e detecta descendente', () => {
    const [raiz] = buildGoalTree(metas);
    expect(collectSubtreeIds(raiz)).toEqual([1, 2, 4, 3]);
    expect(isDescendant(raiz, 4)).toBe(true);
    expect(isDescendant(raiz.children[1], 4)).toBe(false);
  });

  it('progresso soma tarefas de toda a sub-árvore', () => {
    const [raiz] = buildGoalTree(metas);
    const tarefas = new Map<number, Task[]>([
      [1, [{ is_completed: true } as Task]],
      [4, [{ is_completed: false } as Task, { is_completed: true } as Task]],
    ]);
    expect(goalProgress(raiz, tarefas)).toEqual({ done: 2, total: 3, percent: 67 });
    expect(goalProgress(raiz.children[1], tarefas)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it('achata respeitando os recolhidos', () => {
    const arvore = buildGoalTree(metas);
    expect(flattenTree(arvore, new Set()).map(n => n.id)).toEqual([1, 2, 4, 3, 5]);
    expect(flattenTree(arvore, new Set([2])).map(n => n.id)).toEqual([1, 2, 3, 5]);
  });
});

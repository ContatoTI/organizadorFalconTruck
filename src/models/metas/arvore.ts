/**
 * Objetivos em árvore — funções puras (sem banco), usadas na tela.
 *
 * "Melhorar meu corpo" é um objetivo. Ele gera "Ir para a academia" e
 * "Me alimentar melhor" — que são objetivos também, não tarefas. Só na ponta
 * a coisa vira tarefa concreta: "ligar para academias do bairro".
 *
 * Por isso a árvore é de objetivos (goals.parent_id) e as tarefas penduram
 * em qualquer nó dela (todos.goal_id). O que dá o progresso de um objetivo é
 * a soma das tarefas de toda a sua sub-árvore.
 */

import type { Goal, Task } from '@/types/index';

export interface GoalNode extends Goal {
  children: GoalNode[];
  /** Profundidade na árvore, 0 para os objetivos de topo. */
  depth: number;
}

export interface GoalProgress {
  done: number;
  total: number;
  percent: number;
}

/**
 * Monta a árvore a partir da lista plana.
 * Órfãos (pai apagado por fora) sobem para o topo em vez de sumirem.
 */
export function buildGoalTree(goals: Goal[]): GoalNode[] {
  const byId = new Map<number, GoalNode>();
  for (const g of goals) byId.set(g.id, { ...g, children: [], depth: 0 });

  const roots: GoalNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id != null ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const setDepth = (nodes: GoalNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth;
      n.children.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
      setDepth(n.children, depth + 1);
    }
  };
  roots.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
  setDepth(roots, 0);

  return roots;
}

/** Todos os ids de um nó e seus descendentes — a base do progresso. */
export function collectSubtreeIds(node: GoalNode): number[] {
  const ids = [node.id];
  for (const child of node.children) ids.push(...collectSubtreeIds(child));
  return ids;
}

/**
 * Progresso de um objetivo: quantas tarefas da sub-árvore inteira estão
 * concluídas. Um objetivo sem nenhuma tarefa mostra 0 de 0 — o que é honesto:
 * ainda não virou nada concreto.
 */
export function goalProgress(node: GoalNode, tasksByGoal: Map<number, Task[]>): GoalProgress {
  const ids = collectSubtreeIds(node);
  let done = 0;
  let total = 0;

  for (const id of ids) {
    for (const task of tasksByGoal.get(id) ?? []) {
      total++;
      if (task.is_completed) done++;
    }
  }

  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Evita que alguém arraste um objetivo para dentro do próprio filho. */
export function isDescendant(node: GoalNode, candidateId: number): boolean {
  if (node.id === candidateId) return true;
  return node.children.some(child => isDescendant(child, candidateId));
}

/** Achata a árvore para render, mantendo a ordem visual e a profundidade. */
export function flattenTree(nodes: GoalNode[], collapsed: Set<number>): GoalNode[] {
  const out: GoalNode[] = [];
  const walk = (list: GoalNode[]) => {
    for (const node of list) {
      out.push(node);
      if (!collapsed.has(node.id)) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

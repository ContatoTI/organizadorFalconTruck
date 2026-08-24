'use client';

/**
 * Objetivos em árvore.
 *
 * "Melhorar meu corpo" é um objetivo. Ele gera "Ir para a academia" e
 * "Me alimentar melhor" — que são objetivos também, não tarefas. Só na ponta
 * a coisa vira tarefa concreta: "ligar para academias do bairro".
 *
 * Por isso a árvore é de objetivos (goals.parent_id) e as tarefas penduram
 * em qualquer nó dela (todos.goal_id). O que dá o progresso de um objetivo é
 * a soma das tarefas de toda a sua sub-árvore.
 */

import { createClient } from '@/app/lib/supabase/Client';
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

class GoalAPI {
  async list(userId: string): Promise<Goal[]> {
    const client = createClient();
    const { data, error } = await client
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[goalAPI.list] erro Supabase:', JSON.stringify(error, null, 2));
      return [];
    }
    return (data as Goal[]) || [];
  }

  async create(
    userId: string,
    input: { title: string; parentId?: number | null; description?: string | null; targetDate?: string | null; color?: string | null }
  ): Promise<{ success: boolean; data?: Goal; error?: string }> {
    const title = input.title.trim();
    if (!title) return { success: false, error: 'Título não pode estar vazio' };

    try {
      const client = createClient();

      // Posição no fim da lista de irmãos, para o novo item nascer embaixo.
      let q = client.from('goals').select('position').eq('user_id', userId);
      q = input.parentId ? q.eq('parent_id', input.parentId) : q.is('parent_id', null);
      const { data: last } = await q.order('position', { ascending: false }).limit(1).maybeSingle();
      const position = ((last as { position: number } | null)?.position ?? -1) + 1;

      const { data, error } = await client
        .from('goals')
        .insert({
          user_id: userId,
          title,
          parent_id: input.parentId ?? null,
          description: input.description ?? null,
          target_date: input.targetDate ?? null,
          color: input.color ?? '#6366f1',
          position,
          is_completed: false,
        })
        .select()
        .single();

      if (error) {
        console.error('[goalAPI.create] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true, data: data as Goal };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async update(goalId: number, updates: Partial<Goal>): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('goals')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', goalId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Apagar um objetivo leva junto os filhos (ON DELETE CASCADE no banco),
   * mas as tarefas apenas se soltam (ON DELETE SET NULL) — ninguém quer
   * perder tarefa por arrumar a árvore.
   */
  async remove(goalId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client.from('goals').delete().eq('id', goalId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /** Move um objetivo para debaixo de outro (ou para o topo, com null). */
  async move(goalId: number, newParentId: number | null): Promise<{ success: boolean; error?: string }> {
    return this.update(goalId, { parent_id: newParentId });
  }

  /** Tarefas ligadas a qualquer nó da árvore do usuário. */
  async tasksForGoals(goalIds: number[]): Promise<Task[]> {
    if (goalIds.length === 0) return [];
    try {
      const client = createClient();
      const { data, error } = await client
        .from('todos')
        .select('*')
        .in('goal_id', goalIds)
        .is('deleted_at', null)
        .order('position', { ascending: true });
      if (error) return [];
      return (data as Task[]) || [];
    } catch {
      return [];
    }
  }
}

export const goalAPI = new GoalAPI();

// ── Funções puras da árvore ────────────────────────────────────────────────

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

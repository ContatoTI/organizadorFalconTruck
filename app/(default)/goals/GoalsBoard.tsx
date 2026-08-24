'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/Client';
import { taskAPI } from '@/app/lib/taskAPI';
import {
  goalAPI, buildGoalTree, flattenTree, goalProgress, collectSubtreeIds,
  type GoalNode,
} from '@/app/lib/goalAPI';
import { useToast } from '@/app/components/Toast';
import { useUndoableComplete } from '@/app/lib/hooks';
import { parseCapture } from '@/app/lib/quickParse';
import { cn, PROJECT_COLORS } from '@/app/lib/utils';
import { PageShell, PageHeader, EmptyState, PageSkeleton } from '@/app/components/ui/Page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import type { Goal, Task } from '@/types/index';
import {
  Target, Plus, ChevronRight, ChevronDown, Trash2, CornerDownRight,
  Check, CalendarPlus, Pencil, X,
} from 'lucide-react';

type AppUser = { id: string; email?: string };

/**
 * Objetivos em árvore.
 *
 * A tela é feita para o caminho "quero melhorar meu corpo" → "ir para a
 * academia" → "ligar para academias do bairro". À esquerda a árvore inteira,
 * à direita o objetivo escolhido com as tarefas que ele já gerou.
 *
 * A regra que mantém isso útil: só a ponta vira tarefa. Enquanto algo ainda
 * se divide em partes, é sub-objetivo.
 */
export function GoalsBoard() {
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [user, setUser] = useState<AppUser | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const [newRootTitle, setNewRootTitle] = useState('');
  const [newChildTitle, setNewChildTitle] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');

  const taskInputRef = useRef<HTMLInputElement>(null);

  // ── Carga ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user: authUser } } = await client.auth.getUser();
      if (!authUser) { router.push('/login'); return; }
      if (!alive) return;
      setUser(authUser as AppUser);

      const list = await goalAPI.list(authUser.id);
      if (!alive) return;
      setGoals(list);
      setSelectedId(prev => prev ?? list[0]?.id ?? null);

      const goalTasks = await goalAPI.tasksForGoals(list.map(g => g.id));
      if (!alive) return;
      setTasks(goalTasks);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [client, router]);

  const reloadTasks = useCallback(async (goalList: Goal[]) => {
    const goalTasks = await goalAPI.tasksForGoals(goalList.map(g => g.id));
    setTasks(goalTasks);
  }, []);

  // ── Árvore ───────────────────────────────────────────────────────────────
  const tree = useMemo(() => buildGoalTree(goals), [goals]);
  const flat = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const nodeById = useMemo(() => {
    const map = new Map<number, GoalNode>();
    const walk = (nodes: GoalNode[]) => {
      for (const n of nodes) { map.set(n.id, n); walk(n.children); }
    };
    walk(tree);
    return map;
  }, [tree]);

  const tasksByGoal = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const t of tasks) {
      if (!t.goal_id) continue;
      const arr = map.get(t.goal_id);
      if (arr) arr.push(t);
      else map.set(t.goal_id, [t]);
    }
    return map;
  }, [tasks]);

  const selected = selectedId != null ? nodeById.get(selectedId) ?? null : null;
  const selectedTasks = selectedId != null ? tasksByGoal.get(selectedId) ?? [] : [];

  // Só ao TROCAR de objetivo. Se dependesse de title/description, qualquer
  // salvamento no meio da digitação jogaria o texto do usuário fora.
  useEffect(() => {
    if (!selected) return;
    setTitleDraft(selected.title);
    setDescDraft(selected.description ?? '');
    setEditingTitle(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // ── Criar ────────────────────────────────────────────────────────────────
  const createGoal = useCallback(async (title: string, parentId: number | null) => {
    if (!user || !title.trim()) return;

    const color = PROJECT_COLORS[goals.length % PROJECT_COLORS.length];
    const res = await goalAPI.create(user.id, { title, parentId, color });
    if (!res.success || !res.data) {
      toast(res.error ?? 'Erro ao criar objetivo', 'error');
      return;
    }
    setGoals(prev => [...prev, res.data as Goal]);
    setSelectedId(res.data.id);
    if (parentId) setCollapsed(prev => { const next = new Set(prev); next.delete(parentId); return next; });
  }, [user, goals.length, toast]);

  const createTask = useCallback(async (rawTitle: string) => {
    if (!user || !selectedId || !rawTitle.trim()) return;

    // O mesmo parser da captura rápida: "fazer exercícios terça 7h" já nasce
    // com horário e vai direto para a agenda.
    const parsed = parseCapture(rawTitle);
    if (!parsed.title.trim()) return;

    setNewTaskTitle('');
    const res = await taskAPI.createTaskFrom(user.id, {
      title: parsed.title,
      goalId: selectedId,
      dueDate: parsed.dueDate,
      dueAt: parsed.dueAt ? parsed.dueAt.toISOString() : null,
      durationMin: parsed.durationMin ?? (parsed.dueAt ? 30 : null),
      priority: parsed.priority,
    });

    if (res.success && res.data) {
      setTasks(prev => [...prev, res.data as Task]);
      taskInputRef.current?.focus();
    } else {
      toast(res.error ?? 'Erro ao criar tarefa', 'error');
    }
  }, [user, selectedId, toast]);

  // ── Concluir tarefa, com desfazer ───────────────────────────────────────
  const { toggle: toggleTask } = useUndoableComplete<Task>({
    apply: (id, completed) => setTasks(prev => prev.map(t => t.id === id
      ? { ...t, is_completed: completed, status: completed ? 'CONCLUIDO' : 'A_FAZER' }
      : t)),
    persist: (id, completed) => taskAPI.toggleTaskCompletion(id, !completed),
    toast,
  });

  // ── Editar / apagar objetivo ─────────────────────────────────────────────
  const saveGoalField = useCallback(async (goalId: number, updates: Partial<Goal>) => {
    setGoals(prev => prev.map(g => (g.id === goalId ? { ...g, ...updates } : g)));
    const res = await goalAPI.update(goalId, updates);
    if (!res.success) toast(res.error ?? 'Erro ao salvar', 'error');
  }, [toast]);

  const toggleGoalDone = useCallback(async (node: GoalNode) => {
    saveGoalField(node.id, { is_completed: !node.is_completed });
  }, [saveGoalField]);

  const deleteGoal = useCallback(async (node: GoalNode) => {
    const subIds = collectSubtreeIds(node);
    const label = subIds.length > 1
      ? `Excluir “${node.title}” e mais ${subIds.length - 1} sub-objetivo(s)? As tarefas não serão apagadas, apenas soltas.`
      : `Excluir “${node.title}”? As tarefas não serão apagadas, apenas soltas.`;
    if (!confirm(label)) return;

    setGoals(prev => prev.filter(g => !subIds.includes(g.id)));
    setTasks(prev => prev.map(t => (t.goal_id && subIds.includes(t.goal_id) ? { ...t, goal_id: null } : t)));
    if (selectedId && subIds.includes(selectedId)) setSelectedId(null);

    const res = await goalAPI.remove(node.id);
    if (!res.success) {
      toast(res.error ?? 'Erro ao excluir', 'error');
      if (user) {
        const list = await goalAPI.list(user.id);
        setGoals(list);
        reloadTasks(list);
      }
    }
  }, [selectedId, toast, user, reloadTasks]);

  const toggleCollapse = useCallback((id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return <PageShell size="lg"><PageSkeleton rows={5} /></PageShell>;
  if (!user) return null;

  return (
    <PageShell size="lg">
      <PageHeader
        icon={Target}
        title="Objetivos"
        subtitle="O que você quer alcançar, quebrado até virar tarefa que dá para fazer hoje."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        {/* ── A árvore ──────────────────────────────────────────────── */}
        <aside className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="max-h-[62vh] overflow-y-auto py-1">
            {flat.length === 0 ? (
              <EmptyState
                icon={Target}
                title="Nenhum objetivo ainda."
                hint="Comece pelo grande: “melhorar meu corpo”."
              />
            ) : (
              flat.map(node => {
                const progress = goalProgress(node, tasksByGoal);
                const hasChildren = node.children.length > 0;
                const isSelected = node.id === selectedId;
                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedId(node.id)}
                    style={{ paddingLeft: 8 + node.depth * 14 }}
                    className={cn(
                      'group/goal flex items-center gap-1.5 pr-2 py-1.5 cursor-pointer transition-colors',
                      isSelected ? 'bg-primary/10' : 'hover:bg-accent/50'
                    )}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleCollapse(node.id); }}
                      aria-label={hasChildren ? 'Abrir ou fechar' : undefined}
                      className={cn('shrink-0 w-4 h-4 grid place-items-center rounded', !hasChildren && 'invisible')}
                    >
                      {collapsed.has(node.id)
                        ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>

                    <span
                      className="shrink-0 w-2 h-2 rounded-full"
                      style={{ backgroundColor: node.color || '#6366f1' }}
                    />

                    <span className={cn(
                      'flex-1 min-w-0 truncate text-[13px]',
                      node.is_completed && 'line-through text-muted-foreground',
                      isSelected && 'font-medium'
                    )}>
                      {node.title}
                    </span>

                    {progress.total > 0 && (
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {progress.percent}%
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); createGoal(newRootTitle, null); setNewRootTitle(''); }}
            className="flex items-center gap-1.5 p-2 border-t border-border"
          >
            <Input
              value={newRootTitle}
              onChange={(e) => setNewRootTitle(e.target.value)}
              placeholder="Novo objetivo…"
              className="h-8 text-[13px]"
            />
            <Button type="submit" size="icon-sm" disabled={!newRootTitle.trim()} aria-label="Criar objetivo">
              <Plus className="w-4 h-4" />
            </Button>
          </form>
        </aside>

        {/* ── O objetivo escolhido ──────────────────────────────────── */}
        {selected ? (
          <div className="min-w-0 space-y-4">
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => toggleGoalDone(selected)}
                  aria-label={selected.is_completed ? 'Reabrir objetivo' : 'Concluir objetivo'}
                  className={cn(
                    'mt-0.5 shrink-0 w-[18px] h-[18px] rounded-full border-2 grid place-items-center transition-colors',
                    selected.is_completed
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-muted-foreground/30 hover:border-primary'
                  )}
                >
                  {selected.is_completed && <Check className="w-3 h-3" strokeWidth={3} />}
                </button>

                <div className="flex-1 min-w-0">
                  {editingTitle ? (
                    <Input
                      autoFocus
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={() => {
                        setEditingTitle(false);
                        if (titleDraft.trim() && titleDraft !== selected.title) {
                          saveGoalField(selected.id, { title: titleDraft.trim() });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') { setTitleDraft(selected.title); setEditingTitle(false); }
                      }}
                      className="h-8 text-[16px] font-semibold"
                    />
                  ) : (
                    <h2
                      onClick={() => setEditingTitle(true)}
                      className={cn(
                        'text-[16px] font-semibold leading-tight cursor-text',
                        selected.is_completed && 'line-through text-muted-foreground'
                      )}
                    >
                      {selected.title}
                    </h2>
                  )}

                  {(() => {
                    const progress = goalProgress(selected, tasksByGoal);
                    return progress.total > 0 ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Progress value={progress.percent} className="h-1.5 flex-1" />
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {progress.done}/{progress.total}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted-foreground mt-1.5">
                        Ainda não virou nada concreto. Quebre em sub-objetivos ou crie a primeira tarefa.
                      </p>
                    );
                  })()}
                </div>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditingTitle(true)}
                  aria-label="Renomear objetivo"
                  className="text-muted-foreground"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => deleteGoal(selected)}
                  aria-label="Excluir objetivo"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              <Textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={() => {
                  const val = descDraft.trim() || null;
                  if (val !== (selected.description ?? null)) {
                    saveGoalField(selected.id, { description: val });
                  }
                }}
                placeholder="Por que isso importa? (opcional)"
                rows={2}
                className="mt-3 text-[13px] resize-none"
              />

              <div className="flex items-center gap-2 mt-2.5">
                <Label className="text-[12px] text-muted-foreground shrink-0">Quero até</Label>
                <Input
                  type="date"
                  value={selected.target_date ?? ''}
                  onChange={(e) => saveGoalField(selected.id, { target_date: e.target.value || null })}
                  className="h-8 w-[150px] text-[13px]"
                />
                {selected.target_date && (
                  <span className="text-[11.5px] text-muted-foreground">
                    {(() => {
                      const target = new Date(selected.target_date + 'T00:00:00');
                      const days = Math.round((target.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
                      if (days < 0) return `${Math.abs(days)} dia(s) atrasado`;
                      if (days === 0) return 'é hoje';
                      return `faltam ${days} dia(s)`;
                    })()}
                  </span>
                )}
              </div>
            </section>

            {/* ── Sub-objetivos ─────────────────────────────────────── */}
            <section>
              <h3 className="ds-section-header px-1 mb-1.5">Se divide em</h3>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {selected.children.length > 0 ? (
                  selected.children.map(child => {
                    const progress = goalProgress(child, tasksByGoal);
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedId(child.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-accent/50 transition-colors text-left"
                      >
                        <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                        <span
                          className="shrink-0 w-2 h-2 rounded-full"
                          style={{ backgroundColor: child.color || '#6366f1' }}
                        />
                        <span className={cn(
                          'flex-1 min-w-0 truncate text-[13.5px]',
                          child.is_completed && 'line-through text-muted-foreground'
                        )}>
                          {child.title}
                        </span>
                        {progress.total > 0 && (
                          <>
                            <Progress value={progress.percent} className="h-1 w-16 shrink-0" />
                            <span className="text-[10.5px] text-muted-foreground tabular-nums shrink-0 w-9 text-right">
                              {progress.percent}%
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <p className="px-3 py-4 text-[12.5px] text-muted-foreground/60 text-center">
                    Nenhuma parte ainda.
                  </p>
                )}

                <form
                  onSubmit={(e) => { e.preventDefault(); createGoal(newChildTitle, selected.id); setNewChildTitle(''); }}
                  className="flex items-center gap-1.5 p-2 border-t border-border bg-muted/30"
                >
                  <Input
                    value={newChildTitle}
                    onChange={(e) => setNewChildTitle(e.target.value)}
                    placeholder={`Uma parte de “${selected.title}”…`}
                    className="h-8 text-[13px]"
                  />
                  <Button type="submit" size="icon-sm" variant="outline" disabled={!newChildTitle.trim()} aria-label="Criar sub-objetivo">
                    <Plus className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </section>

            {/* ── Tarefas concretas ─────────────────────────────────── */}
            <section>
              <h3 className="ds-section-header px-1 mb-1.5">Tarefas concretas</h3>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {selectedTasks.length > 0 ? (
                  selectedTasks.map(task => (
                    <div
                      key={task.id}
                      className="group/row flex items-center gap-2.5 px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-accent/50 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => toggleTask(task)}
                        aria-label={task.is_completed ? 'Reabrir tarefa' : 'Concluir tarefa'}
                        className={cn(
                          'shrink-0 w-[17px] h-[17px] rounded-[5px] border-2 grid place-items-center transition-colors',
                          task.is_completed ? 'bg-primary border-primary' : 'border-muted-foreground/30 hover:border-primary'
                        )}
                      >
                        {task.is_completed && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </button>
                      <span className={cn(
                        'flex-1 min-w-0 truncate text-[13.5px]',
                        task.is_completed && 'line-through text-muted-foreground'
                      )}>
                        {task.title}
                      </span>
                      {task.due_at && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                          <CalendarPlus className="w-2.5 h-2.5" />
                          {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(task.due_at))}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Soltar do objetivo"
                        title="Tirar do objetivo (a tarefa continua existindo)"
                        onClick={async () => {
                          setTasks(prev => prev.filter(t => t.id !== task.id));
                          await taskAPI.updateTask(task.id, { goal_id: null });
                        }}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-4 text-[12.5px] text-muted-foreground/60 text-center">
                    Nenhuma tarefa. O que dá para fazer esta semana?
                  </p>
                )}

                <form
                  onSubmit={(e) => { e.preventDefault(); createTask(newTaskTitle); }}
                  className="flex items-center gap-1.5 p-2 border-t border-border bg-muted/30"
                >
                  <Input
                    ref={taskInputRef}
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Ex.: ligar para academias do bairro — ou “exercícios terça 7h”"
                    className="h-8 text-[13px]"
                  />
                  <Button type="submit" size="icon-sm" variant="outline" disabled={!newTaskTitle.trim()} aria-label="Criar tarefa">
                    <Plus className="w-4 h-4" />
                  </Button>
                </form>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-1.5 px-1">
                Escreva o dia e a hora no próprio texto que a tarefa já vai para o calendário.
              </p>
            </section>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={Target}
              title="Escolha um objetivo à esquerda."
              hint="Ou crie o primeiro para começar a quebrar em partes."
            />
          </div>
        )}
      </div>
    </PageShell>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { X, Edit, Trash2, XCircle, CheckSquare } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { taskAPI } from '@/src/views/tarefas/clienteTarefas';
import { grupoAPI } from '@/src/views/grupos/clienteGrupos';
import { onTaskMoved, onTaskMoveError, shouldSkipRealtimeFetch, skipRealtimeFetch, TaskMovedEvent, TaskMoveErrorEvent } from '@/src/views/tarefas/taskEvents';
import type { Task, Group } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { PageShell, PageHeader, EmptyState, ListCard, ListRow, RowAction, PageSkeleton } from '@/src/components/ui/Page';
import { TaskDetailPanel } from '@/src/views/tarefas/TaskDetailPanel';
import { QuickCapture, type CaptureTarget, type CaptureDraft } from '@/src/views/tarefas/QuickCapture';
import { useToast } from '@/src/components/Toast';
import { ToggleChips } from '@/src/components/ToggleChips';
import { useUndoableDelete, useUndoableComplete } from '@/src/hooks/hooks';

export function PaginaTodos() {
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const router = useRouter();
  const client = createClient();
  const { toast } = useToast();
  const undoableDeleteTask = useUndoableDelete<Task>({
    deleteFn: (task) => taskAPI.deleteTask(task.id),
    onRemove: (task) => setTasks(prev => prev.filter(t => t.id !== task.id)),
    onRestore: (task) => setTasks(prev => [task, ...prev]),
    toast,
    getId: (task) => task.id,
  });

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
    };
    getUser();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('showCompleted');
    if (stored !== null) setShowCompleted(stored !== 'false');
  }, []);

  useEffect(() => {
    if (user) {
      fetchGroups();
      fetchTasks(true);

      // Realtime subscription — sem filtro de user_id para capturar
      // alterações em tasks de projetos feitas por outros membros
      const channel = client
        .channel('todos-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'todos' },
          () => {
            if (shouldSkipRealtimeFetch()) return;
            fetchTasks(false);
          }
        )
        .subscribe();

      const handleTasksUpdated = () => {
        fetchTasks(false);
      };
      window.addEventListener('tasks-updated', handleTasksUpdated);

      // Reage a moves otimistas vindos do dashboard/outras origens:
      // atualiza APENAS a tarefa especifica (sem refetch) e reverte em caso de erro.
      const handleTaskMoved = (detail: TaskMovedEvent) => {
        setTasks(prev => prev.map(t => t.id === detail.taskId ? detail.taskSnapshot : t));
      };
      const handleTaskMoveError = (detail: TaskMoveErrorEvent) => {
        setTasks(prev => prev.map(t => t.id === detail.taskId ? detail.originalTask : t));
        alert(`Erro ao mover a tarefa: ${detail.error}`);
      };
      const offMoved = onTaskMoved(handleTaskMoved);
      const offMoveError = onTaskMoveError(handleTaskMoveError);

      return () => {
        client.removeChannel(channel);
        window.removeEventListener('tasks-updated', handleTasksUpdated);
        offMoved();
        offMoveError();
      };
    }
  }, [user]);

  const fetchGroups = async () => {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const data = await grupoAPI.list('title').catch(() => null);
    if (data) setGroups(data);
  };

  const fetchTasks = async (showLoading = false) => {
    if (!user) return;
    if (showLoading) setLoading(true);

    const data = await taskAPI.getUserTasks({ showCompleted: true });
    setTasks(data);
    if (showLoading) setLoading(false);
  };

  const displayedTasks = tasks.filter(t => showCompleted || !t.is_completed).sort((a, b) => {
    const order: Record<string, number> = { alta: 3, media: 2, baixa: 1 };
    const pa = order[a.priority ?? ''] ?? 0;
    const pb = order[b.priority ?? ''] ?? 0;
    return pb - pa;
  });

  /**
   * Captura rápida desta tela. O destino segue o filtro de grupo escolhido
   * logo ao lado: com "Sem grupo" a tarefa cai na Caixa de Entrada, com um
   * grupo selecionado ela já nasce dentro dele.
   */
  const handleQuickCapture = async (drafts: CaptureDraft[]) => {
    if (!user || drafts.length === 0) return;

    const optimistic: Task[] = drafts.map((d, i) => ({
      id: -(Date.now() + i),
      user_id: user.id,
      title: d.title,
      is_completed: false,
      due_date: d.dueDate,
      due_at: d.dueAt ? d.dueAt.toISOString() : null,
      duration_min: d.durationMin ?? null,
      view_group_id: selectedGroupId || null,
      project_id: null,
      section_id: null,
      position: 99999,
      description: null,
      priority: d.priority,
      recur_freq: d.recur?.freq ?? null,
      recur_interval: d.recur ? 1 : null,
      recur_weekdays: d.recur?.freq === 'weekly' && d.recur.weekdays.length > 0 ? d.recur.weekdays : null,
      status: 'A_FAZER',
      status_changed_at: new Date().toISOString(),
      auto_review_reason: null,
      created_at: new Date().toISOString(),
      isSyncing: true,
    } as Task));

    setTasks(prev => [...optimistic, ...prev]);

    const results = await Promise.all(drafts.map(d =>
      taskAPI.createTaskFrom({
        title: d.title,
        groupId: selectedGroupId || null,
        dueDate: d.dueDate,
        dueAt: d.dueAt ? d.dueAt.toISOString() : null,
        durationMin: d.durationMin ?? (d.dueAt ? 30 : null),
        priority: d.priority,
        recur: d.recur,
      })
    ));

    setTasks(prev => {
      let next = prev;
      results.forEach((res, i) => {
        const tempId = optimistic[i].id;
        next = res.success && res.data
          ? next.map(t => (t.id === tempId ? { ...res.data!, isSyncing: false } : t))
          : next.filter(t => t.id !== tempId);
      });
      return next;
    });

    const failed = results.filter(r => !r.success).length;
    if (failed > 0) toast(`Erro ao criar ${failed} tarefa(s)`, 'error');
  };


  // Concluir com desfazer: mesmo comportamento do Dashboard, para o gesto
  // mais repetido do app se comportar igual em qualquer tela.
  const { toggle: toggleTask } = useUndoableComplete<Task>({
    apply: (id, completed) => setTasks(prev => prev.map(t => t.id === id
      ? { ...t, is_completed: completed, status: completed ? 'CONCLUIDO' : 'A_FAZER' }
      : t)),
    // toggleTaskCompletion recebe o estado ATUAL e inverte, então passamos o
    // oposto do estado que queremos alcançar.
    persist: (id, completed) => taskAPI.toggleTaskCompletion(id, !completed),
    toast,
  });

  const handlePriorityChange = async (taskId: number, priority: string | null) => {
    const original = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, priority, isSyncing: true } : t
    ));
    const result = await taskAPI.updateTask(taskId, { priority });
    if (!result.success) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...original!, isSyncing: false } : t));
      toast('Erro ao atualizar prioridade', 'error');
    } else {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isSyncing: false } : t));
    }
  };

  const deleteTask = (taskId: number) => {
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;
    undoableDeleteTask.remove(taskToDelete, 'Tarefa excluída');
  };

  const updateTask = async () => {
    if (!editingTask || !editingTask.id) return;

    // OPTIMISTIC UPDATE
    const originalTask = tasks.find(t => t.id === editingTask.id);
    setTasks(prev => prev.map(t => 
      t.id === editingTask.id ? { ...t, title: editingTask.title || t.title, due_date: editingTask.due_date || t.due_date } : t
    ));
    setEditingTask(null);

    const result = await taskAPI.updateTask(editingTask.id, {
      title: editingTask.title,
      view_group_id: editingTask.view_group_id,
      due_date: editingTask.due_date,
      priority: editingTask.priority,
    });

    if (!result.success && originalTask) {
      setTasks(prev => prev.map(t =>
        t.id === originalTask.id ? originalTask : t
      ));
      toast('Erro ao atualizar tarefa', 'error');
    }
  };

  if (!user) {
    return <PageShell><PageSkeleton /></PageShell>;
  }

  const activeGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId) : null;
  const captureTargets: CaptureTarget[] = [
    activeGroup
      ? {
          key: `group:${activeGroup.id}`,
          label: activeGroup.title,
          kind: activeGroup.type === 'time' ? 'group-time' : 'group-list',
          color: activeGroup.color,
        }
      : { key: 'inbox', label: 'Caixa de Entrada', kind: 'inbox', color: null },
  ];

  const pending = displayedTasks.filter(t => !t.is_completed).length;

  return (
    <PageShell>
      <PageHeader
        icon={CheckSquare}
        title="Todas as tarefas"
        subtitle={`${pending} em aberto`}
      />

      <div className="mb-3 max-w-3xl">
        <QuickCapture
          targets={captureTargets}
          activeKey={captureTargets[0].key}
          onActiveKeyChange={() => {}}
          onCreate={handleQuickCapture}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select
          value={selectedGroupId?.toString() || "none"}
          onValueChange={(val: string | null) => setSelectedGroupId(val === "none" || !val ? null : parseInt(val))}
        >
          <SelectTrigger className="w-[170px] h-8 text-[13px]">
            <SelectValue>
              {(value: string) => (value === 'none' || !value) ? 'Sem grupo' : groups.find((g) => g.id.toString() === value)?.title ?? 'Sem grupo'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem grupo</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id.toString()}>{g.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleChips
          options={[
            { key: 'completed', label: 'Concluídas', checked: showCompleted, onChange: (v: boolean) => { setShowCompleted(v); localStorage.setItem('showCompleted', String(v)); }, title: 'Incluir tarefas concluídas' },
          ]}
        />
      </div>

      {loading ? (
        <PageSkeleton rows={5} />
      ) : displayedTasks.length === 0 ? (
        <ListCard>
          <EmptyState
            icon={CheckSquare}
            title="Nenhuma tarefa encontrada."
            hint={showCompleted ? 'Nada por aqui com os filtros atuais.' : 'Ative “Concluídas” para ver o que já foi feito.'}
          />
        </ListCard>
      ) : (
        <ListCard>
          {displayedTasks.map((task) => (
            <ListRow key={task.id}>
              <Checkbox
                checked={task.is_completed}
                onCheckedChange={() => toggleTask(task)}
              />
              <div className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                task.priority === 'urgente' && "bg-red-500",
                task.priority === 'alta' && "bg-orange-500",
                task.priority === 'media' && "bg-amber-400",
                (task.priority === 'baixa' || !task.priority) && "bg-slate-300",
              )} />
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => setSelectedTask(task)}
                  className={cn(
                    'text-left text-[13.5px] leading-5 bg-transparent border-none p-0 cursor-pointer hover:text-primary transition-colors',
                    task.is_completed && 'line-through text-muted-foreground'
                  )}
                >
                  {task.title}
                </button>
                {(() => {
                  const allGroupIds: number[] = [];
                  if (task.view_group_id) allGroupIds.push(task.view_group_id);
                  if (task.linked_view_group_ids?.length) {
                    task.linked_view_group_ids.forEach(id => {
                      if (!allGroupIds.includes(id)) allGroupIds.push(id);
                    });
                  }
                  return allGroupIds.map(gid => {
                    const g = groups.find(g => g.id === gid);
                    if (!g) return null;
                    return (
                      <span key={gid} className="ml-1.5 text-[10.5px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                        {g.title}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await taskAPI.removeTaskFromGroup(task.id, gid);
                            setTasks(prev => prev.map(t =>
                              t.id === task.id ? {
                                ...t,
                                view_group_id: t.view_group_id === gid ? null : t.view_group_id,
                                linked_view_group_ids: t.linked_view_group_ids?.filter(id => id !== gid) || []
                              } : t
                            ));
                          }}
                          className="hover:text-destructive"
                          aria-label={`Tirar de ${g.title}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    );
                  });
                })()}
              </div>
              <RowAction icon={Edit} label="Editar tarefa" onClick={() => setEditingTask(task)} />
              <RowAction icon={Trash2} label="Excluir tarefa" danger onClick={() => deleteTask(task.id)} />
            </ListRow>
          ))}
        </ListCard>
      )}

      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Tarefa</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <div className="space-y-4 py-4">
              <Input
                type="text"
                value={editingTask.title || ''}
                onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                placeholder="Título da tarefa"
              />
              <Input
                type="date"
                value={editingTask.due_date || ''}
                onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })}
              />
              <Select
                value={editingTask.view_group_id?.toString() || "none"}
                onValueChange={(val: string | null) => setEditingTask({ ...editingTask, view_group_id: val === "none" || !val ? null : parseInt(val) })}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string) => (value === 'none' || !value) ? 'Sem grupo' : groups.find((g) => g.id.toString() === value)?.title ?? 'Sem grupo'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>{g.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={editingTask.priority || 'none'}
                onValueChange={(val: string | null) => setEditingTask({ ...editingTask, priority: val === 'none' || !val ? null : val })}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string) => value === 'alta' ? 'Alta' : value === 'media' ? 'Média' : value === 'baixa' ? 'Baixa' : 'Sem prioridade'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem prioridade</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)}>Cancelar</Button>
            <Button onClick={updateTask}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Detail Panel */}
      {selectedTask && user && (
        <TaskDetailPanel
          task={selectedTask}
          groups={groups}
          currentUserId={user.id}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updatedTask) => {
            setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
            setSelectedTask(updatedTask);
          }}
          onMoveToGroup={async (groupId) => {
            const result = await taskAPI.moveTaskToGroup(selectedTask.id, groupId);
            if (result.success) {
              setTasks(prev => prev.map(t => t.id === selectedTask.id
                ? { ...t, view_group_id: groupId, project_id: null, section_id: null }
                : t));
            } else {
              toast('Erro ao mover tarefa', 'error');
            }
          }}
        />
      )}
    </PageShell>
  );
}

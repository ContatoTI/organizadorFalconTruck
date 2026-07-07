'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { X, Edit, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { taskAPI } from '@/app/lib/taskAPI';
import { onTaskMoved, onTaskMoveError, shouldSkipRealtimeFetch, TaskMovedEvent, TaskMoveErrorEvent } from '@/app/lib/taskEvents';
import type { Task, Group } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { TaskDetailPanel } from '@/app/components/TaskDetailPanel';
import { InlineTaskCreator } from '@/app/components/InlineTaskCreator';
import { ToastProvider, useToast } from '@/app/components/Toast';
import { ToggleChips } from '@/app/components/ToggleChips';

export default function TodosPage() {
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const router = useRouter();
  const client = createClient();
  const { toast } = useToast();

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

    const { data } = await client
      .from('view_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('title');

    if (data) setGroups(data);
  };

  const fetchTasks = async (showLoading = false) => {
    if (!user) return;
    if (showLoading) setLoading(true);

    const data = await taskAPI.getUserTasks(user.id, { showCompleted: true });
    setTasks(data);
    if (showLoading) setLoading(false);
  };

  const displayedTasks = tasks.filter(t => showCompleted || !t.is_completed).sort((a, b) => {
    const order: Record<string, number> = { alta: 3, media: 2, baixa: 1 };
    const pa = order[a.priority ?? ''] ?? 0;
    const pb = order[b.priority ?? ''] ?? 0;
    return pb - pa;
  });

  const addTask = async (titleOverride?: string) => {
    const raw = (titleOverride ?? newTaskTitle).trim();
    if (!raw || !user) return;

    const titles = raw.split('\n').map(t => t.trim()).filter(Boolean);
    if (titles.length === 0) return;

    // OPTIMISTIC UPDATE
    const newOptimisticTasks = titles.map((title, index) => ({
      id: Date.now() + index, // Temporary ID
      title,
      user_id: user.id,
      project_id: null,
      section_id: null,
      view_group_id: selectedGroupId || null,
      is_completed: false,
      position: 99999,
      created_at: new Date().toISOString(),
      due_date: null,
      description: null,
      priority: null,
      status: 'a_fazer',
      creator_name: (user as any).user_metadata?.full_name || user.email,
      isSyncing: true,
    } as Task));

    setTasks(prev => [...newOptimisticTasks, ...prev]);
    setNewTaskTitle('');

    const results = await Promise.all(titles.map(title => 
      taskAPI.createTask(
        user.id,
        title,
        undefined,
        undefined,
        selectedGroupId || undefined
      )
    ));

    if (results.some(r => !r.success)) {
      const failedTempIds = new Set(newOptimisticTasks.filter((_, i) => !results[i].success).map(t => t.id));
      setTasks(prev => prev.filter(t => !failedTempIds.has(t.id)));
      toast('Erro ao criar tarefa(s)', 'error');
    }

    results.forEach((res, i) => {
      if (res.success && res.data) {
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === newOptimisticTasks[i].id);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = res.data as Task;
            return next;
          }
          if (!prev.some(t => t.id === res.data!.id)) {
            return [res.data as Task, ...prev];
          }
          return prev;
        });
      }
    });
  };

  const toggleTask = async (task: Task) => {
    // OPTIMISTIC UPDATE
    const newState = !task.is_completed;
    setTasks(prev => prev.map(t =>
      t.id === task.id ? { ...t, is_completed: newState, status: newState ? 'concluida' : 'a_fazer', isSyncing: true } : t
    ));

    const result = await taskAPI.toggleTaskCompletion(task.id, task.is_completed);
    if (!result.success) {
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, is_completed: !newState, status: !newState ? 'concluida' : 'a_fazer', isSyncing: false } : t
      ));
      toast('Erro ao atualizar tarefa', 'error');
    } else {
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, isSyncing: false } : t
      ));
    }
  };

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

  const deleteTask = async (taskId: number) => {
    // OPTIMISTIC UPDATE
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;
    const originalTask = { ...taskToDelete };

    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, isSyncing: true } : t
    ));

    const result = await taskAPI.deleteTask(taskId);
    if (result.success) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } else {
      setTasks(prev => prev.map(t => t.id === taskId ? originalTask : t));
      toast('Erro ao excluir tarefa', 'error');
    }
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
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <ToastProvider>
    <div className="p-6 w-full max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Todas as Tarefas</h1>

      <div className="flex gap-2 mb-8">
        <InlineTaskCreator
          onCreateSimpleTask={async (title) => await addTask(title)}
          placeholder="Adicionar nova tarefa..."
          buttonText="Nova tarefa"
          className="flex-1"
        />
        <Select
          value={selectedGroupId?.toString() || "none"}
          onValueChange={(val: string | null) => setSelectedGroupId(val === "none" || !val ? null : parseInt(val))}
        >
          <SelectTrigger className="w-[180px]">
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
          className="ml-auto"
          options={[
            { key: 'completed', label: 'Concluídas', checked: showCompleted, onChange: (v: boolean) => { setShowCompleted(v); localStorage.setItem('showCompleted', String(v)); }, title: 'Incluir tarefas concluídas' },
          ]}
        />
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : displayedTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <p>Nenhuma tarefa encontrada.</p>
          </div>
        ) : (
          displayedTasks.map((task) => (
            <Card
              key={task.id}
              className="flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors group shadow-xs"
            >
              <Checkbox
                checked={task.is_completed}
                onCheckedChange={() => toggleTask(task)}
              />
              <div className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                task.priority === 'alta' && "bg-red-600",
                task.priority === 'media' && "bg-yellow-500",
                (task.priority === 'baixa' || !task.priority) && "bg-green-600",
              )} />
              <div className="flex-1">
                <button
                  onClick={() => setSelectedTask(task)}
                  className={'text-left bg-transparent border-none p-0 cursor-pointer hover:underline' + (task.is_completed ? ' line-through text-muted-foreground' : '')}
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
                      <span key={gid} className="ml-1 text-xs bg-muted px-2 py-0.5 rounded inline-flex items-center gap-1">
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
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  });
                })()}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingTask(task)}
                className="text-muted-foreground hover:text-primary"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteTask(task.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </Card>
          ))
        )}
      </div>

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
    </div>
    </ToastProvider>
  );
}

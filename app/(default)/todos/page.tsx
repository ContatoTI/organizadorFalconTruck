'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { Plus, X, Edit, Trash2, Check, XCircle } from 'lucide-react';
import { taskAPI } from '@/app/lib/taskAPI';
import type { Task, Group } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { TaskDetailPanel } from '@/app/components/TaskDetailPanel';

export default function TodosPage() {
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const router = useRouter();
  const client = createClient();

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
          () => fetchTasks(false)
        )
        .subscribe();

      return () => {
        client.removeChannel(channel);
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

  const addTask = async () => {
    const raw = newTaskTitle.trim();
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

    // Se houve erro, re-faz fetch
    if (results.some(r => !r.success)) {
      await fetchTasks();
    } else {
      // Atualiza IDs temporários pelos reais
      setTasks(prev => {
        const next = [...prev];
        results.forEach((res, i) => {
          if (res.success && res.data) {
            const idx = next.findIndex(t => t.id === newOptimisticTasks[i].id);
            if (idx !== -1) next[idx] = res.data;
          }
        });
        return next;
      });
    }
  };

  const toggleTask = async (task: Task) => {
    // OPTIMISTIC UPDATE
    const newState = !task.is_completed;
    setTasks(prev => prev.map(t =>
      t.id === task.id ? { ...t, is_completed: newState } : t
    ));

    const result = await taskAPI.toggleTaskCompletion(task.id, task.is_completed);
    if (!result.success) {
      // Revert on error
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, is_completed: !newState } : t
      ));
      await fetchTasks();
    }
  };

  const deleteTask = async (taskId: number) => {
    // OPTIMISTIC UPDATE
    const taskToDelete = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));

    const result = await taskAPI.deleteTask(taskId);
    if (!result.success && taskToDelete) {
      // Revert on error
      setTasks(prev => [...prev, taskToDelete]);
      await fetchTasks();
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
      due_date: editingTask.due_date
    });

    if (!result.success && originalTask) {
      // Revert on error
      setTasks(prev => prev.map(t => 
        t.id === originalTask.id ? originalTask : t
      ));
      await fetchTasks();
    }
  };

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Todas as Tarefas</h1>

      <div className="flex gap-2 mb-8">
        <Input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
          onPaste={async (e) => {
            const text = e.clipboardData.getData('text');
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length > 1) {
              e.preventDefault();
              for (const title of lines) {
                await taskAPI.createTask(
                  user.id,
                  title,
                  undefined,
                  undefined,
                  selectedGroupId || undefined
                );
              }
              setNewTaskTitle('');
            }
          }}
          placeholder="Adicionar nova tarefa..."
          className="flex-1"
        />
        <Select
          value={selectedGroupId?.toString() || "none"}
          onValueChange={(val: string | null) => setSelectedGroupId(val === "none" || !val ? null : parseInt(val))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sem grupo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem grupo</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id.toString()}>{g.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={addTask}>
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <p>Nenhuma tarefa encontrada.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <Card
              key={task.id}
              className="flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors group shadow-xs"
            >
              <Checkbox
                checked={task.is_completed}
                onCheckedChange={() => toggleTask(task)}
              />
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
                  <SelectValue placeholder="Sem grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>{g.title}</SelectItem>
                  ))}
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
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updatedTask) => {
            setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
            setSelectedTask(updatedTask);
          }}
        />
      )}
    </div>
  );
}

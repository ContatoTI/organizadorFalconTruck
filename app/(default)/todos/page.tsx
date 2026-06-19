'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { Plus, X, Edit, Trash2, Check } from 'lucide-react';
import { taskAPI } from '@/app/lib/taskAPI';
import type { Task, Group } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';

export default function TodosPage() {
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
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
      fetchTasks();

      // Realtime subscription
      const channel = client
        .channel('todos-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setTasks((prev) => [payload.new as Task, ...prev.filter(t => t.id !== payload.new.id)]);
            } else if (payload.eventType === 'UPDATE') {
              setTasks((prev) => prev.map(t => t.id === payload.new.id ? (payload.new as Task) : t));
            } else if (payload.eventType === 'DELETE') {
              setTasks((prev) => prev.filter(t => t.id !== payload.old.id));
            }
          }
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

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);

    const data = await taskAPI.getUserTasks(user.id, { showCompleted: true });
    setTasks(data);
    setLoading(false);
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !user) return;

    const result = await taskAPI.createTask(
      user.id,
      newTaskTitle,
      undefined,
      undefined,
      selectedGroupId || undefined
    );

    if (result.success && result.data) {
      // realtime should pick it up, but we can do it optimistically
      setNewTaskTitle('');
    }
  };

  const toggleTask = async (task: Task) => {
    await taskAPI.toggleTaskCompletion(task.id, task.is_completed);
  };

  const deleteTask = async (taskId: number) => {
    await taskAPI.deleteTask(taskId);
  };

  const updateTask = async () => {
    if (!editingTask || !editingTask.id) return;

    await taskAPI.updateTask(editingTask.id, {
      title: editingTask.title,
      view_group_id: editingTask.view_group_id,
      due_date: editingTask.due_date
    });

    setEditingTask(null);
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
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
            <p>Nenhuma tarefa encontrada.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <Card
              key={task.id}
              className="flex items-center gap-3 p-4 hover:bg-accent/5 transition-colors group"
            >
              <Checkbox
                checked={task.is_completed}
                onCheckedChange={() => toggleTask(task)}
              />
              <div className="flex-1">
                <span className={task.is_completed ? 'line-through text-muted-foreground' : ''}>
                  {task.title}
                </span>
                {task.view_group_id && groups.find(g => g.id === task.view_group_id) && (
                  <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded">
                    {groups.find(g => g.id === task.view_group_id)?.title}
                  </span>
                )}
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
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';

export default function TodosPage() {
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<any>(null);
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
              setTasks((prev) => [payload.new, ...prev.filter(t => t.id !== payload.new.id)]);
            } else if (payload.eventType === 'UPDATE') {
              setTasks((prev) => prev.map(t => t.id === payload.new.id ? payload.new : t));
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

    const { data } = await client
      .from('todos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setTasks(data);
    setLoading(false);
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !user) return;

    const { data, error } = await client
      .from('todos')
      .insert({
        user_id: user.id,
        title: newTaskTitle,
        is_completed: false,
        view_group_id: selectedGroupId,
      })
      .select()
      .single();

    if (!error && data) {
      setTasks([data, ...tasks]);
      setNewTaskTitle('');
    }
  };

  const toggleTask = async (task: any) => {
    const newCompleted = !task.is_completed;

    await client
      .from('todos')
      .update({ is_completed: newCompleted })
      .eq('id', task.id);

    setTasks(tasks.map(t => t.id === task.id ? { ...t, is_completed: newCompleted } : t));
  };

  const deleteTask = async (taskId: number) => {
    await client.from('todos').delete().eq('id', taskId);
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const updateTask = async () => {
    if (!editingTask) return;

    await client
      .from('todos')
      .update({
        title: editingTask.title,
        description: editingTask.description,
        view_group_id: editingTask.view_group_id,
      })
      .eq('id', editingTask.id);

    setTasks(tasks.map(t => t.id === editingTask.id ? editingTask : t));
    setEditingTask(null);
  };

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Todas as Tarefas</h1>

      <div className="flex gap-2 mb-8">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
          placeholder="Adicionar nova tarefa..."
          className="flex-1 px-4 py-2 rounded-lg border border-input bg-background text-sm"
        />
        <select
          value={selectedGroupId ?? ''}
          onChange={(e) => setSelectedGroupId(e.target.value ? parseInt(e.target.value) : null)}
          className="px-4 py-2 rounded-lg border border-input bg-background text-sm"
        >
          <option value="">Sem grupo</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>
        <button
          onClick={addTask}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-5 h-5" />
        </button>
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
            <div
              key={task.id}
              className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors group"
            >
              <button
                onClick={() => toggleTask(task)}
                className={`w-5 h-5 rounded border flex items-center justify-center ${
                  task.is_completed
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-input hover:border-primary'
                }`}
              >
                {task.is_completed && <span>✓</span>}
              </button>
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
              <button
                onClick={() => setEditingTask(task)}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Editar
              </button>
              <button
                onClick={() => deleteTask(task.id)}
                className="p-2 text-muted-foreground hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg w-full max-w-md space-y-4">
            <h2 className="text-xl font-bold">Editar Tarefa</h2>
            <input
              type="text"
              value={editingTask.title}
              onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background"
            />
            <textarea
              value={editingTask.description || ''}
              onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
              placeholder="Descrição (opcional)"
              className="w-full px-4 py-2 rounded-lg border border-input bg-background"
              rows={3}
            />
            <input
              type="date"
              value={editingTask.due_date || ''}
              onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background"
            />
            <select
              value={editingTask.group_id ?? ''}
              onChange={(e) => setEditingTask({ ...editingTask, group_id: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background"
            >
              <option value="">Sem grupo</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={updateTask}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground"
              >
                Salvar
              </button>
              <button
                onClick={() => setEditingTask(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-input"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

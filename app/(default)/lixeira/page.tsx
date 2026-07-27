'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { RotateCcw, X } from 'lucide-react';
import { taskAPI } from '@/app/lib/taskAPI';
import type { Task } from '@/types/index';
import { useToast } from '@/app/components/Toast';

function formatDeletedAt(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LixeiraPage() {
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
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
    if (user) fetchDeletedTasks();
  }, [user]);

  const fetchDeletedTasks = async () => {
    setLoading(true);
    const data = await taskAPI.getDeletedTasks();
    setTasks(data);
    setLoading(false);
  };

  const restoreTask = async (task: Task) => {
    setTasks(prev => prev.filter(t => t.id !== task.id));
    const result = await taskAPI.restoreTask(task.id);
    if (!result.success) {
      setTasks(prev => [task, ...prev]);
      toast(result.error || 'Erro ao restaurar tarefa', 'error');
    } else {
      toast('Tarefa restaurada', 'success');
    }
  };

  const permanentlyDeleteTask = async (task: Task) => {
    if (!confirm(`Excluir "${task.title}" definitivamente? Essa ação não pode ser desfeita.`)) return;
    setTasks(prev => prev.filter(t => t.id !== task.id));
    const result = await taskAPI.permanentlyDeleteTask(task.id);
    if (!result.success) {
      setTasks(prev => [task, ...prev]);
      toast(result.error || 'Erro ao excluir tarefa', 'error');
    } else {
      toast('Tarefa excluída definitivamente', 'success');
    }
  };

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Lixeira</h1>
      <p className="text-muted-foreground mb-8">
        Tarefas excluídas ficam aqui até serem restauradas ou removidas definitivamente.
      </p>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
          <p>A lixeira está vazia.</p>
        </div>
      ) : (
        <div className="border border-border rounded-[10px] overflow-hidden bg-card shadow-xs">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="group/task flex items-center gap-2 py-2 px-[14px] border-b border-border/30 last:border-b-0 hover:bg-accent/[0.04] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <span className="block text-[13px] truncate text-muted-foreground line-through">
                  {task.title}
                </span>
                <span className="text-[11px] text-muted-foreground/70">
                  Excluída em {formatDeletedAt(task.deleted_at)}
                </span>
              </div>
              <button
                onClick={() => restoreTask(task)}
                title="Restaurar tarefa"
                className="flex-shrink-0 opacity-0 group-hover/task:opacity-60 hover:!opacity-100 transition-all text-muted-foreground hover:text-primary"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => permanentlyDeleteTask(task)}
                title="Excluir definitivamente"
                className="flex-shrink-0 opacity-0 group-hover/task:opacity-30 hover:!opacity-100 transition-all text-muted-foreground hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

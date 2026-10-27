'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { RotateCcw, X, Trash2 } from 'lucide-react';
import { PageShell, PageHeader, EmptyState, ListCard, ListRow, RowAction, PageSkeleton } from '@/src/components/ui/Page';
import { chamarApi, comoResultado as resultado, type Resultado } from '@/src/lib/chamarApi';
import type { Task } from '@/types/index';
import { useToast } from '@/src/components/Toast';

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

const API = '/api/lixeira';

export function PaginaLixeira() {
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
    try {
      setTasks(await chamarApi<Task[]>(API));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setLoading(false);
  };

  const restoreTask = async (task: Task) => {
    setTasks(prev => prev.filter(t => t.id !== task.id));
    const result = await resultado(() => chamarApi(`${API}/${task.id}/restaurar`, { method: 'POST' }));
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
    const result = await resultado(() => chamarApi(`${API}/${task.id}`, { method: 'DELETE' }));
    if (!result.success) {
      setTasks(prev => [task, ...prev]);
      toast(result.error || 'Erro ao excluir tarefa', 'error');
    } else {
      toast('Tarefa excluída definitivamente', 'success');
    }
  };

  if (!user) {
    return <PageShell><PageSkeleton /></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader
        icon={Trash2}
        title="Lixeira"
        subtitle="Tarefas excluídas ficam aqui até serem restauradas ou removidas de vez."
      />

      {loading ? (
        <PageSkeleton rows={3} />
      ) : tasks.length === 0 ? (
        <ListCard>
          <EmptyState icon={Trash2} title="A lixeira está vazia." hint="Nada excluído por aqui." />
        </ListCard>
      ) : (
        <ListCard>
          {tasks.map((task) => (
            <ListRow key={task.id}>
              <div className="flex-1 min-w-0">
                <span className="block text-[13px] truncate text-muted-foreground line-through">
                  {task.title}
                </span>
                <span className="text-[11px] text-muted-foreground/70">
                  Excluída em {formatDeletedAt(task.deleted_at)}
                </span>
              </div>
              <RowAction icon={RotateCcw} label="Restaurar tarefa" onClick={() => restoreTask(task)} />
              <RowAction icon={X} label="Excluir definitivamente" danger onClick={() => permanentlyDeleteTask(task)} />
            </ListRow>
          ))}
        </ListCard>
      )}
    </PageShell>
  );
}

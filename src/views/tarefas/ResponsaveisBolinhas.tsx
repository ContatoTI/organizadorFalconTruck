'use client';

/**
 * Bolinhas de responsável na linha da tarefa: até 3 pessoas.
 * A primeira é a principal (assignee_id); as outras são extras (task_shares).
 * Só o dono do projeto consegue gravar (o servidor confere).
 */

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn, getColorFromString, getInitials } from '@/src/lib/utils';
import { chamarApi } from '@/src/lib/chamarApi';
import { useToast } from '@/src/components/Toast';
import { LIMITE_RESPONSAVEIS } from '@/src/models/tarefas/responsaveis';
import type { Task } from '@/types/index';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Candidato { user_id: string; full_name?: string | null; email?: string | null }
type Pessoa = { id: string; nome: string };

interface Props {
  task: Task;
  candidatos: Candidato[];
  onAssigneeChange: (taskId: number, assigneeId: string | null) => void | Promise<void>;
}

const nomeDe = (c: Candidato) => c.full_name || c.email || 'Usuário';

export function ResponsaveisBolinhas({ task, candidatos, onAssigneeChange }: Props) {
  const [extras, setExtras] = useState<Pessoa[]>([]);
  const [salvando, setSalvando] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setExtras((task.extra_assignees || []).map(e => ({ id: e.user_id, nome: e.name })));
  }, [task.extra_assignees]);

  const nomePorId = (id: string) => {
    const c = candidatos.find(x => x.user_id === id);
    return c ? nomeDe(c) : 'Usuário';
  };

  const principal: Pessoa | null = task.assignee_id
    ? { id: task.assignee_id, nome: nomePorId(task.assignee_id) !== 'Usuário' ? nomePorId(task.assignee_id) : task.assignee_name || 'Usuário' }
    : null;
  const pessoas: Pessoa[] = principal ? [principal, ...extras] : extras;
  const ids = pessoas.map(p => p.id);
  const cheio = ids.length >= LIMITE_RESPONSAVEIS;

  const alternar = async (id: string) => {
    if (salvando) return;
    const novos = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    if (novos.length > LIMITE_RESPONSAVEIS) return;

    const novoPrincipal = novos[0] ?? null;
    const novosExtras = novos.slice(1);
    setSalvando(true);
    try {
      if (novoPrincipal !== (task.assignee_id ?? null)) await onAssigneeChange(task.id, novoPrincipal);
      await chamarApi(`/api/tarefas/${task.id}/responsaveis`, { method: 'PUT', json: { usuarioIds: novosExtras } });
      setExtras(novosExtras.map(e => ({ id: e, nome: nomePorId(e) })));
    } catch (e) {
      toast((e as Error).message || 'Não foi possível salvar os responsáveis.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const mostrar = pessoas.length > 0 ? pessoas : (task.creator_name ? [{ id: 'criador', nome: task.creator_name }] : []);
  if (mostrar.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center flex-shrink-0 cursor-pointer rounded-full"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        title={mostrar.map(p => p.nome).join(', ')}
      >
        {mostrar.map((p, i) => (
          <span
            key={p.id}
            className={cn(
              'w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-background',
              i > 0 && '-ml-1.5',
            )}
            style={{ backgroundColor: getColorFromString(p.nome) }}
          >
            {getInitials(p.nome)}
          </span>
        ))}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-1 z-[100]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="px-2 py-1 text-xs text-muted-foreground">
          Responsáveis ({ids.length}/{LIMITE_RESPONSAVEIS})
        </p>
        {candidatos.map(c => {
          const marcado = ids.includes(c.user_id);
          const bloqueado = salvando || (!marcado && cheio);
          return (
            <button
              key={c.user_id}
              type="button"
              disabled={bloqueado}
              onClick={() => alternar(c.user_id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className={cn(
                'flex h-4 w-4 items-center justify-center rounded-[4px] border border-input',
                marcado && 'border-primary bg-primary text-primary-foreground',
              )}>
                {marcado && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate">{nomeDe(c)}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

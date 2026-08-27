'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/app/lib/utils';
import type { Task } from '@/types/index';
import { GripVertical, Clock, Trash2, AlertTriangle, AlertCircle, CalendarClock, UserCheck } from 'lucide-react';
import { describeHorizon } from '@/app/lib/planning';
import { RecurrenceBadge } from '@/app/components/RecurrenceEditor';
import { PriorityPicker } from '@/app/components/PriorityPicker';
import { priorityMeta, type PriorityValue } from '@/app/lib/priority';

/** Rótulo curto de quando a tarefa cai, já no fuso local. */
export function whenLabel(task: Task): { text: string; overdue: boolean } | null {
  const iso = task.due_at ?? (task.due_date ? `${task.due_date}T00:00:00` : null);
  if (!iso) return null;

  const target = new Date(iso);
  if (isNaN(target.getTime())) return null;

  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(target) - startOf(now)) / 86400000);

  const day =
    days === 0 ? 'hoje' :
    days === 1 ? 'amanhã' :
    days === -1 ? 'ontem' :
    days > 1 && days < 7 ? new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(target).replace('.', '') :
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(target).replace('.', '');

  const text = task.due_at
    ? `${day} ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(target)}`
    : day;

  return { text, overdue: !task.is_completed && target.getTime() < now.getTime() && days <= 0 };
}

interface TaskRowProps {
  task: Task;
  /** Prefixo do id de drag, para o mesmo task poder existir em duas listas. */
  dragScope: string;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** Cor da faixa lateral (bloco/lista/projeto de origem). */
  accent?: string | null;
  isOverlay?: boolean;
  className?: string;
  /** Menu de ações (adiar, delegar, mover). Quando ausente, cai no ícone de excluir. */
  actions?: React.ReactNode;
  /** Nome de quem está com a tarefa, quando ela foi delegada. */
  assigneeLabel?: string | null;
  /** Trocar a prioridade direto na linha. Sem isso, o ícone fica só de leitura. */
  onSetPriority?: (task: Task, priority: PriorityValue | null) => void;
}

export function TaskRow({ task, dragScope, onToggle, onSelect, onDelete, accent, isOverlay, className, actions, assigneeLabel, onSetPriority }: TaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${dragScope}:task:${task.id}`,
    data: { type: 'Task', task },
    disabled: isOverlay,
  });

  const when = whenLabel(task);
  const horizon = describeHorizon(task);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'group/row relative flex items-center gap-2 pl-2 pr-2 py-[7px] transition-colors',
        'border-b border-border/50 last:border-b-0',
        isDragging && 'opacity-30',
        isOverlay
          ? 'rounded-lg border border-primary/60 bg-card shadow-lg w-[280px]'
          : 'hover:bg-accent/50',
        task.is_completed && 'opacity-50',
        className
      )}
    >
      {accent && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ backgroundColor: accent }} />
      )}

      <button
        {...attributes}
        {...listeners}
        aria-label="Arrastar tarefa"
        className={cn(
          'shrink-0 p-0.5 -ml-0.5 rounded text-muted-foreground/25 cursor-grab active:cursor-grabbing touch-none',
          'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity',
          isOverlay && 'opacity-100'
        )}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={() => onToggle(task)}
        aria-label={task.is_completed ? 'Reabrir tarefa' : 'Concluir tarefa'}
        className={cn(
          'shrink-0 w-[17px] h-[17px] rounded-[5px] border-2 flex items-center justify-center transition-colors',
          task.is_completed
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/30 hover:border-primary'
        )}
      >
        {task.is_completed && (
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 6.5 L4.5 9 L10 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {!isOverlay && onSetPriority ? (
        <PriorityPicker
          value={task.priority}
          onChange={(p) => onSetPriority(task, p)}
        />
      ) : task.priority ? (
        <span
          className={cn('shrink-0', priorityMeta(task.priority)?.text ?? 'text-slate-400')}
          title={`Prioridade: ${priorityMeta(task.priority)?.label ?? task.priority}`}
        >
          <AlertCircle className="w-4 h-4" />
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => onSelect(task)}
        className={cn(
          'flex-1 min-w-0 text-left text-[13.5px] leading-5 truncate',
          task.is_completed && 'line-through'
        )}
      >
        {task.title}
      </button>

      <RecurrenceBadge task={task} />

      {horizon && (
        <span
          className="shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
          title="Guardada para depois"
        >
          <CalendarClock className="w-2.5 h-2.5" />
          {horizon}
        </span>
      )}

      {assigneeLabel && (
        <span
          className="shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          title={`Aguardando ${assigneeLabel}`}
        >
          <UserCheck className="w-2.5 h-2.5" />
          {assigneeLabel}
        </span>
      )}

      {when && (
        <span
          className={cn(
            'shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md tabular-nums',
            when.overdue
              ? 'text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400'
              : 'text-muted-foreground bg-muted'
          )}
        >
          {when.overdue ? <AlertTriangle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
          {when.text}
        </span>
      )}

      {task.isSyncing && (
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" title="Salvando…" />
      )}

      {!isOverlay && actions}

      {!isOverlay && !actions && (
        <button
          type="button"
          onClick={() => onDelete(task)}
          aria-label="Excluir tarefa"
          className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

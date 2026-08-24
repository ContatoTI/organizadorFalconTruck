'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/app/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface DropTargetProps {
  /** 'group:12' | 'project:3' | 'inbox' */
  id: string;
  label: string;
  icon: LucideIcon;
  count: number;
  color?: string | null;
  /** "12:00 – 13:30" ou "em 25 min" */
  hint?: string | null;
  href?: string;
  onClick?: () => void;
  /** Bloco cuja hora chegou — ganha destaque permanente. */
  active?: boolean;
}

export function DropTarget({ id, label, icon: Icon, count, color, hint, onClick, active }: DropTargetProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'dropTarget', key: id } });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-all',
        isOver
          ? 'border-primary bg-primary/10 ring-2 ring-primary/30 scale-[1.02]'
          : active
            ? 'border-primary/40 bg-primary/5'
            : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: color || 'hsl(var(--muted-foreground))' }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium truncate leading-tight">{label}</p>
        {hint && <p className="text-[10.5px] text-muted-foreground truncate leading-tight mt-0.5">{hint}</p>}
      </div>
      {count > 0 && (
        <span
          className={cn(
            'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums',
            active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Área de soltura que envolve um bloco inteiro (a lista da Caixa de Entrada,
 * o cartão de um bloco de tempo). Sem isto não haveria como trazer uma tarefa
 * de volta de um bloco para a caixa de entrada arrastando.
 */
export function DropZone({
  id, dropKey, children, className,
}: {
  /** Id ÚNICO no DndContext. O mesmo bloco pode ter chip e área ao mesmo tempo. */
  id: string;
  /** Destino de verdade ('inbox' | 'group:12' | 'project:3'). Pode repetir. */
  dropKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'dropTarget', key: dropKey } });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl transition-all',
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Chip de horizonte ("Amanhã", "Próx. semana", "Setembro", "2027").
 * Solta aqui o que não é para agora e a tarefa some da Caixa de Entrada até
 * aquele horizonte chegar.
 */
export function PlanChip({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'plan', key: id } });

  return (
    <span
      ref={setNodeRef}
      className={cn(
        'inline-flex items-center h-7 px-2.5 rounded-full border text-[11.5px] transition-all select-none',
        isOver
          ? 'border-violet-500 bg-violet-500 text-white scale-105 shadow-sm'
          : 'border-dashed border-border bg-card text-muted-foreground'
      )}
    >
      {label}
    </span>
  );
}

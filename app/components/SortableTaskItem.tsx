import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn, getColorFromString, getInitials } from '@/app/lib/utils';
import type { Task, Group } from '@/types/index';
import { isToday } from 'date-fns';
import { X, XCircle, Loader2 } from 'lucide-react';

interface SortableTaskItemProps {
  task: Task;
  currentGroupId?: number;
  groups: Group[];
  userEmail?: string;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  onRemoveFromGroup?: (taskId: number, groupId: number) => void;
  onDelete: (taskId: number) => void;
  isOverlay?: boolean;
  isPending?: boolean;
}

export const SortableTaskItem = memo(function SortableTaskItem({
  task,
  currentGroupId,
  groups,
  userEmail,
  onToggle,
  onSelect,
  onRemoveFromGroup,
  onDelete,
  isOverlay = false,
  isPending = false,
}: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `task-${task.id}`,
    data: {
      type: 'Task',
      task,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const currentGroup = currentGroupId ? groups.find(g => g.id === currentGroupId) : null;
  const timeDisplay = currentGroup?.start_time ? currentGroup.start_time.substring(0, 5) : null;
  const dateDisplay = task.due_date && isToday(task.due_date) ? 'hoje' : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group/task flex items-center gap-[10px] py-[9px] px-[14px] border-b border-border/40 last:border-b-0 transition-all duration-300",
        isDragging && !isOverlay && "opacity-20 bg-accent/30 border-dashed border-2 border-primary/30",
    isOverlay && "opacity-90 rounded-xl shadow-2xl border-2 border-primary ring-4 ring-primary/20 scale-[1.05] pointer-events-none cursor-grabbing z-50",
    (isPending || task.isSyncing) && "opacity-60 border-dashed border-primary/50"
  )}
>
      {/* Pending loading bar at top */}
      {(isPending || task.isSyncing) && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/20 overflow-hidden">
          <div className="h-full w-full bg-primary animate-pulse origin-left" />
        </div>
      )}

      {/* 6-dot drag handle */}
      <div 
        {...attributes} 
        {...listeners}
        style={{ touchAction: 'none' }}
        className={cn(
          "flex-shrink-0 cursor-grab active:cursor-grabbing outline-none",
          isOverlay ? "opacity-100" : "opacity-0 group-hover/task:opacity-100 transition-opacity"
        )}
      >
        <svg width="10" height="12" viewBox="0 0 10 12" fill="#cbd5e1">
          <circle cx="3" cy="2.5" r="1"/><circle cx="7" cy="2.5" r="1"/>
          <circle cx="3" cy="6" r="1"/><circle cx="7" cy="6" r="1"/>
          <circle cx="3" cy="9.5" r="1"/><circle cx="7" cy="9.5" r="1"/>
        </svg>
      </div>

      {/* Loading spinner when pending */}
      {(isPending || task.isSyncing) && (
        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
      )}

      {/* Circular checkbox */}
      <button
        onClick={() => onToggle(task)}
        className="flex-shrink-0 flex items-center justify-center transition-colors hover:scale-110"
        style={{
          width: 15, height: 15, borderRadius: '50%',
          border: task.is_completed ? 'none' : '1.5px solid #cbd5e1',
          background: task.is_completed ? '#22c55e' : 'transparent',
        }}
      >
        {task.is_completed && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 4.5L3 6.5L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Task title and description preview */}
      <div className="flex-1 min-w-0">
        <button
          onClick={() => onSelect(task)}
          className={cn(
            "block w-full text-[13px] text-left truncate bg-transparent border-none p-0 cursor-pointer hover:text-primary transition-colors",
            task.is_completed ? "line-through text-slate-400" : "text-slate-800"
          )}
        >
          {task.title}
        </button>
        {task.description && (
          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}
      </div>

      {/* Creator avatar (only for shared tasks) */}
      {task.creator_name && task.creator_name !== userEmail && (
        <div
          className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
          style={{ backgroundColor: getColorFromString(task.creator_name) }}
          title={task.creator_name}
        >
          {getInitials(task.creator_name)}
        </div>
      )}

      {/* Time / date indicator */}
      {(timeDisplay || dateDisplay) && (
        <span className="text-[10px] font-semibold text-orange-500 flex-shrink-0">
          {timeDisplay ?? dateDisplay}
        </span>
      )}

      {/* Status badge */}
      <span className={cn(
        "text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0",
        (!task.status || task.status === 'a_fazer') && "bg-slate-100 text-slate-500",
        task.status === 'em_andamento' && "bg-blue-50 text-blue-600",
        task.status === 'concluida' && "bg-green-50 text-green-600",
      )}>
        {(!task.status || task.status === 'a_fazer') ? 'A fazer' :
         task.status === 'em_andamento' ? 'Em andamento' : 'Concluído'}
      </span>

      {/* Remove from group */}
      {currentGroupId && onRemoveFromGroup && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveFromGroup(task.id, currentGroupId);
          }}
          title="Remover deste bloco/lista"
          className="flex-shrink-0 opacity-0 group-hover/task:opacity-100 transition-opacity text-slate-300 hover:text-orange-400"
        >
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Delete */}
      <button
        onClick={() => onDelete(task.id)}
        className="flex-shrink-0 opacity-0 group-hover/task:opacity-100 transition-opacity text-slate-300 hover:text-red-400"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

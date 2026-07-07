import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn, getColorFromString, getInitials } from '@/app/lib/utils';
import type { Task, Group } from '@/types/index';
import { isToday } from 'date-fns';
import { X, XCircle, Loader2, AlertCircle, Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface AssigneeCandidate {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
}

interface SortableTaskItemProps {
  task: Task;
  currentGroupId?: number;
  groups: Group[];
  userEmail?: string;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  onRemoveFromGroup?: (taskId: number, groupId: number) => void;
  onDelete: (taskId: number) => void;
  onPriorityChange?: (taskId: number, priority: string | null) => void;
  onStatusChange?: (taskId: number) => void;
  onApprove?: (taskId: number) => void;
  onReject?: (taskId: number) => void;
  assigneeCandidates?: AssigneeCandidate[];
  onAssigneeChange?: (taskId: number, assigneeId: string | null) => void;
  isOverlay?: boolean;
  isPending?: boolean;
  /**
   * ID único do dnd-kit para esta instância do card. Uma mesma tarefa pode
   * aparecer em vários blocos do Dashboard ao mesmo tempo (projeto + bloco de
   * tempo, por exemplo); sem um id qualificado por bloco, duas instâncias
   * simultâneas do useSortable disputam o mesmo registro interno do dnd-kit e
   * o DragOverlay acaba posicionado com base no node errado (offset visual).
   * Default mantém compatibilidade para usos com uma única instância por tarefa.
   */
  dragId?: string;
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
  onPriorityChange,
  onStatusChange,
  onApprove,
  onReject,
  assigneeCandidates,
  onAssigneeChange,
  isOverlay = false,
  isPending = false,
  dragId,
}: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: dragId ?? `task-${task.id}`,
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
  const priorityLabel = task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Média' : 'Baixa';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group/task flex items-center gap-[10px] py-[9px] px-[14px] border-b border-border/40 last:border-b-0 transition-all duration-300",
        isDragging && !isOverlay && "opacity-20 bg-accent/30 border-dashed border-2 border-primary/30",
    isOverlay && "opacity-90 rounded-xl shadow-2xl border-2 border-primary ring-4 ring-primary/20 pointer-events-none cursor-grabbing z-50",
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
          isOverlay ? "opacity-100" : "opacity-40 md:opacity-10 hover:opacity-100 group-hover/task:opacity-100 transition-opacity"
        )}
        title="Arrastar para reordenar"
      >
        <svg width="10" height="12" viewBox="0 0 10 12" fill="#94a3b8">
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
            task.is_completed ? "line-through text-muted-foreground" : "text-slate-800"
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

      {/* Assignee / Creator avatar */}
      {(() => {
        // ponytail: mostra o assignee se houver, senão o criador. Se onAssigneeChange
        // e assigneeCandidates existirem, transforma em dropdown para reatribuir inline.
        const avatarName = task.assignee_name || task.creator_name;
        if (!avatarName) return null;
        const avatarColor = getColorFromString(avatarName);
        const avatarInitials = getInitials(avatarName);

        if (onAssigneeChange && assigneeCandidates && assigneeCandidates.length > 0) {
          return (
            <Select
              value={task.assignee_id ?? 'none'}
              onValueChange={(val) => onAssigneeChange(task.id, val === 'none' ? null : val)}
            >
              <SelectTrigger
                className="h-[22px] w-[22px] rounded-full border-0 p-0 flex items-center justify-center [&>svg:last-child]:hidden data-[size=default]:h-[22px] data-[size=default]:w-[22px] cursor-pointer flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                title={avatarName}
              >
                <div
                  className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-semibold text-white"
                  style={{ backgroundColor: avatarColor }}
                >
                  {avatarInitials}
                </div>
              </SelectTrigger>
              <SelectContent side="bottom" align="end" className="bg-popover border border-border shadow-lg z-[100]">
                <SelectItem value="none">Sem responsável</SelectItem>
                {assigneeCandidates.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.full_name || c.email || 'Usuário'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

        return (
          <div
            className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
            style={{ backgroundColor: avatarColor }}
            title={avatarName}
          >
            {avatarInitials}
          </div>
        );
      })()}

      {/* Time / date indicator */}
      {(timeDisplay || dateDisplay) && (
        <span className="text-[10px] font-semibold text-orange-500 flex-shrink-0">
          {timeDisplay ?? dateDisplay}
        </span>
      )}

      {/* Status badge */}
      {task.status === 'REVISAO' && onApprove && onReject ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onApprove(task.id); }}
            className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors flex items-center gap-0.5"
            title="Aprovar"
          >
            <Check className="w-2.5 h-2.5" /> Aprovar
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onReject(task.id); }}
            className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors flex items-center gap-0.5"
            title="Reprovar"
          >
            <XCircle className="w-2.5 h-2.5" /> Reprovar
          </button>
        </div>
      ) : onStatusChange ? (
        <button
          onClick={(e) => { e.stopPropagation(); onStatusChange(task.id); }}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity",
            (!task.status || task.status === 'A_FAZER') && "bg-slate-100 text-slate-500",
            task.status === 'EM_ANDAMENTO' && "bg-blue-50 text-blue-600",
            task.status === 'REVISAO' && "bg-yellow-50 text-yellow-600",
            task.status === 'CONCLUIDO' && "bg-green-50 text-green-600",
          )}
        >
          {(!task.status || task.status === 'A_FAZER') ? 'A fazer' :
           task.status === 'EM_ANDAMENTO' ? 'Em andamento' :
           task.status === 'REVISAO' ? 'Revisão' : 'Concluído'}
        </button>
      ) : (
        <span className={cn(
          "text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0",
          (!task.status || task.status === 'A_FAZER') && "bg-slate-100 text-slate-500",
          task.status === 'EM_ANDAMENTO' && "bg-blue-50 text-blue-600",
          task.status === 'REVISAO' && "bg-yellow-50 text-yellow-600",
          task.status === 'CONCLUIDO' && "bg-green-50 text-green-600",
        )}>
          {(!task.status || task.status === 'A_FAZER') ? 'A fazer' :
           task.status === 'EM_ANDAMENTO' ? 'Em andamento' :
           task.status === 'REVISAO' ? 'Revisão' : 'Concluído'}
        </span>
      )}

      {/* Priority badge */}
      {onPriorityChange && (
        <Select
          value={task.priority || 'none'}
          onValueChange={(val: string | null) => {
            onPriorityChange(task.id, val === 'none' ? null : val);
          }}
        >
          <SelectTrigger
            className={cn(
              "h-5 w-fit justify-center gap-1 rounded-full border-0 px-2 py-0 text-[10px] font-semibold whitespace-nowrap flex-shrink-0 cursor-pointer data-[size=default]:h-5 [&>svg:last-child]:hidden",
              task.priority === 'alta' && "bg-red-600 text-white",
              task.priority === 'media' && "bg-yellow-500 text-black",
              (task.priority === 'baixa' || !task.priority) && "bg-green-600 text-white",
            )}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <AlertCircle className="size-2.5" />
            <span>{priorityLabel}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              Sem prioridade
            </SelectItem>
            <SelectItem value="alta">
              <span className="w-2 h-2 rounded-full bg-red-600" />
              Alta
            </SelectItem>
            <SelectItem value="media">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              Média
            </SelectItem>
            <SelectItem value="baixa">
              <span className="w-2 h-2 rounded-full bg-green-600" />
              Baixa
            </SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Remove from group */}
      {currentGroupId && onRemoveFromGroup && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveFromGroup(task.id, currentGroupId);
          }}
          title="Remover deste bloco/lista"
          className="flex-shrink-0 opacity-10 hover:opacity-100 group-hover/task:opacity-100 transition-opacity text-slate-400 hover:text-orange-400"
        >
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Delete */}
      <button
        onClick={() => onDelete(task.id)}
        title="Remover tarefa"
        className="flex-shrink-0 opacity-10 hover:opacity-100 group-hover/task:opacity-100 transition-opacity text-slate-400 hover:text-red-400"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

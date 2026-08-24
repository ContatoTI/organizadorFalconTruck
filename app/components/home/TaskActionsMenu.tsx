'use client';

import { useMemo } from 'react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/app/lib/utils';
import { planBuckets } from '@/app/lib/planning';
import { blockTimeLabel } from '@/app/lib/timeBlocks';
import type { Task, Group, Project, Goal, PlanHorizon } from '@/types/index';
import {
  MoreHorizontal, CalendarClock, UserPlus, Inbox, Clock, List as ListIcon,
  Folder, Trash2, Undo2, Target,
} from 'lucide-react';

export interface PersonOption {
  id: string;
  name: string;
}

interface TaskActionsMenuProps {
  task: Task;
  groups: Group[];
  projects: Project[];
  people: PersonOption[];
  now: Date;
  onDefer: (task: Task, horizon: PlanHorizon | null, date: Date | null) => void;
  onDelegate: (task: Task, personId: string | null) => void;
  onMove: (task: Task, key: string) => void;
  onDelete: (task: Task) => void;
  /** Objetivos disponíveis para pendurar a tarefa. */
  goals?: Goal[];
  onLinkGoal?: (task: Task, goalId: number | null) => void;
  className?: string;
}

/**
 * O menu de "tirar isso da frente".
 *
 * Arrastar é ótimo com o mouse, mas nem toda tarefa está perto do destino —
 * e no celular não existe arrastar confortável. Este menu dá o mesmo poder
 * em dois cliques: adiar por horizonte, passar para alguém, jogar num bloco.
 */
export function TaskActionsMenu({
  task, groups, projects, people, now,
  onDefer, onDelegate, onMove, onDelete, goals = [], onLinkGoal, className,
}: TaskActionsMenuProps) {
  const buckets = useMemo(() => planBuckets(now), [now]);
  const timeGroups = useMemo(() => groups.filter(g => g.type === 'time'), [groups]);
  const listGroups = useMemo(() => groups.filter(g => g.type === 'list'), [groups]);

  const isDeferred = !!task.plan_horizon;
  const isDelegated = task.status === 'AGUARDANDO';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Ações da tarefa"
        className={cn(
          'shrink-0 grid place-items-center h-6 w-6 rounded-md text-muted-foreground/40 transition-all',
          'hover:text-foreground hover:bg-muted',
          'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 data-popup-open:bg-muted',
          className
        )}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-auto min-w-[210px]">
        {/* ── Adiar ─────────────────────────────────────────────────── */}
        <DropdownMenuLabel>Guardar para depois</DropdownMenuLabel>
        {buckets.map(bucket => (
          <DropdownMenuItem
            key={bucket.key}
            onClick={() => onDefer(task, bucket.horizon, new Date(bucket.date + 'T00:00:00'))}
          >
            <CalendarClock className="text-muted-foreground" />
            {bucket.label}
          </DropdownMenuItem>
        ))}

        {isDeferred && (
          <DropdownMenuItem onClick={() => onDefer(task, null, null)}>
            <Undo2 className="text-muted-foreground" />
            Trazer de volta para agora
          </DropdownMenuItem>
        )}

        {/* ── Delegar ───────────────────────────────────────────────── */}
        {(people.length > 0 || isDelegated) && <DropdownMenuSeparator />}

        {people.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <UserPlus className="text-muted-foreground" />
              Passar para alguém
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[180px]">
              {people.map(person => (
                <DropdownMenuItem key={person.id} onClick={() => onDelegate(task, person.id)}>
                  {person.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {isDelegated && (
          <DropdownMenuItem onClick={() => onDelegate(task, null)}>
            <Undo2 className="text-muted-foreground" />
            Retomar para mim
          </DropdownMenuItem>
        )}

        {/* ── Mover ─────────────────────────────────────────────────── */}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Inbox className="text-muted-foreground" />
            Mover para
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[190px]">
            <DropdownMenuItem onClick={() => onMove(task, 'inbox')}>
              <Inbox className="text-muted-foreground" />
              Caixa de Entrada
            </DropdownMenuItem>

            {timeGroups.length > 0 && <DropdownMenuSeparator />}
            {timeGroups.map(group => (
              <DropdownMenuItem key={group.id} onClick={() => onMove(task, `group:${group.id}`)}>
                <Clock style={{ color: group.color || undefined }} />
                <span className="truncate">{group.title}</span>
                <span className="ml-auto pl-2 text-[10px] text-muted-foreground tabular-nums">
                  {blockTimeLabel(group, now) ?? ''}
                </span>
              </DropdownMenuItem>
            ))}

            {listGroups.length > 0 && <DropdownMenuSeparator />}
            {listGroups.map(group => (
              <DropdownMenuItem key={group.id} onClick={() => onMove(task, `group:${group.id}`)}>
                <ListIcon style={{ color: group.color || undefined }} />
                <span className="truncate">{group.title}</span>
              </DropdownMenuItem>
            ))}

            {projects.length > 0 && <DropdownMenuSeparator />}
            {projects.map(project => (
              <DropdownMenuItem key={project.id} onClick={() => onMove(task, `project:${project.id}`)}>
                <Folder style={{ color: project.color || undefined }} />
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {onLinkGoal && goals.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Target className="text-muted-foreground" />
              {task.goal_id ? 'Trocar de objetivo' : 'Ligar a um objetivo'}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[190px]">
              {task.goal_id && (
                <>
                  <DropdownMenuItem onClick={() => onLinkGoal(task, null)}>
                    <Undo2 className="text-muted-foreground" />
                    Soltar do objetivo
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {goals.map(goal => (
                <DropdownMenuItem key={goal.id} onClick={() => onLinkGoal(task, goal.id)}>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: goal.color || '#6366f1' }}
                  />
                  <span className="truncate">{goal.title}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(task)}>
          <Trash2 />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

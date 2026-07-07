'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Calendar, User, Clock, Share } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { taskAPI } from '@/app/lib/taskAPI';
import { projectAPI } from '@/app/lib/projectAPI';
import { createClient } from '@/app/lib/supabase/Client';
import type { Task, Group } from '@/types/index';
import { ShareEntityDialog } from '@/app/components/ShareEntityDialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const STATUS_OPTIONS = [
  { value: 'a_fazer', label: 'A fazer' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluida', label: 'Concluída' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'baixa', label: 'Baixa', color: 'bg-green-600' },
  { value: 'media', label: 'Média', color: 'bg-yellow-500' },
  { value: 'alta', label: 'Alta', color: 'bg-red-600' },
  { value: 'urgente', label: 'Urgente', color: 'bg-red-700' },
] as const;

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface TaskDetailPanelProps {
  task: Task;
  groups: Group[];
  currentUserId: string;
  onClose: () => void;
  onUpdate: (updatedTask: Task) => void;
  onMoveToGroup: (groupId: number) => void;
}

export function TaskDetailPanel({ task, groups, currentUserId, onClose, onUpdate, onMoveToGroup }: TaskDetailPanelProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [status, setStatus] = useState(task.status ?? 'a_fazer');
  const [priority, setPriority] = useState(task.priority ?? '');
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  const [saving, setSaving] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [projectMembers, setProjectMembers] = useState<{user_id: string; full_name?: string; email?: string}[]>([]);
  const [isProjectOwner, setIsProjectOwner] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lists = groups.filter((g) => g.type === 'list');
  const timeBlocks = groups.filter((g) => g.type === 'time');

  const save = useCallback(async (updates: Partial<Task>) => {
    setSaving(true);
    // OPTIMISTIC UPDATE: Atualiza UI antes da resposta
    onUpdate({ ...task, ...updates } as Task);

    const result = await taskAPI.updateTask(task.id, updates);
    if (!result.success) {
      // Reverte em caso de erro
      onUpdate(task);
      console.error('Erro ao atualizar tarefa:', result.error);
    }
    setSaving(false);
  }, [task, onUpdate]);

  const debouncedSave = useCallback((updates: Partial<Task>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(updates), 600);
  }, [save]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    debouncedSave({ title: value });
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    debouncedSave({ description: value || null });
  };

  const handleStatusChange = (value: string | null) => {
    const val = value ?? 'a_fazer';
    setStatus(val);
    const isCompleted = val === 'concluida';
    save({ status: val, is_completed: isCompleted });
  };

  const handlePriorityChange = (value: string | null) => {
    const val = value ?? '';
    setPriority(val);
    save({ priority: val || null });
  };

  const handleDueDateChange = (value: string | null) => {
    const val = value ?? '';
    setDueDate(val);
    save({ due_date: val || null });
  };

  const handleAssigneeChange = (value: string | null) => {
    save({ assignee_id: value || null });
  };

  const handleMoveToGroup = (value: string | null) => {
    if (!value) return;
    const groupId = parseInt(value, 10);
    if (groupId === task.view_group_id) return;
    onMoveToGroup(groupId);
    onClose();
  };

  const handleTitleBlur = () => {
    if (title !== task.title) {
      save({ title });
    }
  };

  const handleDescriptionBlur = () => {
    const val = description || null;
    if (val !== task.description) {
      save({ description: val });
    }
  };

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? '');
    setStatus(task.status ?? 'a_fazer');
    setPriority(task.priority ?? '');
    setDueDate(task.due_date ?? '');
  }, [task]);

  useEffect(() => {
    if (task.project_id) {
      projectAPI.isProjectOwner(task.project_id, currentUserId).then(setIsProjectOwner);
    } else {
      setIsProjectOwner(false);
    }
  }, [task.project_id, currentUserId]);

  useEffect(() => {
    if (task.project_id) {
      projectAPI.getProjectMembers(task.project_id).then(async (members) => {
        if (members.length === 0) return;
        const userIds = members.map(m => m.user_id);
        const client = createClient();
        const { data: profiles } = await client
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        setProjectMembers(members.map(m => {
          const profile = profileMap.get(m.user_id);
          return {
            user_id: m.user_id,
            full_name: profile?.full_name ?? undefined,
            email: profile?.email ?? undefined,
          };
        }));
      });
    }
  }, [task.project_id]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay - mesmo estilo do modal Novo Projeto */}
      <div
        className="absolute inset-0 bg-foreground/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel - mesma linguagem visual do modal */}
      <div
        className={cn(
          "relative w-full max-w-lg bg-card text-card-foreground shadow-modal border-l border-border",
          "flex flex-col h-full",
          "animate-in slide-in-from-right duration-300"
        )}
      >
        {/* Header - mesmo estilo do modal Novo Projeto */}
        <div className="flex items-center justify-between p-6 pb-4">
          <h3 className="text-lg font-semibold">
            {task.title}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {/* Title - editável inline com estilo do modal */}
          <div>
            <label className="text-sm text-muted-foreground block mb-1">
              Título
            </label>
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Título da tarefa"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm text-muted-foreground block mb-1">
              Descrição
            </label>
            <Textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder="Adicione uma descrição..."
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[100px] resize-y"
            />
          </div>

          {/* Grid fields */}
          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Status
              </label>
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string) => STATUS_OPTIONS.find((opt) => opt.value === value)?.label ?? value}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent side="bottom" align="start" className="bg-popover border border-border shadow-lg z-[100]">
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Prioridade
              </label>
              <Select value={priority} onValueChange={handlePriorityChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string) => PRIORITY_OPTIONS.find((opt) => opt.value === value)?.label ?? 'Sem prioridade'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent side="bottom" align="start" className="bg-popover border border-border shadow-lg z-[100]">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full', opt.color)} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Data de entrega
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => handleDueDateChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Assignee */}
            {task.project_id && projectMembers.length > 0 && (
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Responsável
                </label>
                {isProjectOwner ? (
                  <Select value={task.assignee_id ?? ''} onValueChange={handleAssigneeChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem responsável" />
                    </SelectTrigger>
                    <SelectContent side="bottom" align="start" className="bg-popover border border-border shadow-lg z-[100]">
                      <SelectItem value="">Sem responsável</SelectItem>
                      {projectMembers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.full_name || member.email || 'Usuário'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="w-full px-3 py-2 rounded-lg border border-input bg-muted/50 text-sm text-muted-foreground">
                    {task.assignee_name || 'Sem responsável'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Move to list / time block */}
          <div>
            <label className="text-sm text-muted-foreground block mb-1">
              Mover para
            </label>
            <Select value={task.view_group_id ? String(task.view_group_id) : ''} onValueChange={handleMoveToGroup}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione uma lista ou bloco de tempo" />
              </SelectTrigger>
              <SelectContent side="bottom" align="start" className="bg-popover border border-border shadow-lg z-[100]">
                {lists.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Listas</SelectLabel>
                    {lists.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {timeBlocks.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Blocos de Tempo</SelectLabel>
                    {timeBlocks.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Metadata */}
          <div className="pt-4 space-y-3">
            <h4 className="text-sm text-muted-foreground font-medium">
              Detalhes
            </h4>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span>{task.creator_name || 'Usuário'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Criado em {formatDateTime(task.created_at)}</span>
            </div>
            {task.due_date && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Entrega: {new Date(task.due_date).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {saving ? 'Salvando...' : 'Todas as alterações são salvas automaticamente'}
          </span>
          <div className="flex items-center gap-2">
            {task.project_id && (
              <button
                type="button"
                onClick={() => setShowShareDialog(true)}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-xs text-muted-foreground"
                title="Compartilhar esta tarefa"
              >
                <Share className="w-3.5 h-3.5" /> Compartilhar
              </button>
            )}
            <Badge variant="outline" className="text-xs">
              #{task.id}
            </Badge>
          </div>
        </div>
      </div>

      {showShareDialog && (
        <ShareEntityDialog
          open={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          entityType="task"
          entityId={task.id}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}

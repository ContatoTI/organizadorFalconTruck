'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/src/lib/utils';
import { Button } from '@/components/ui/button';
import { Plus, X, AlignLeft } from 'lucide-react';
import type { Destination } from './NewTaskDialog';

interface InlineTaskCreatorProps {
  onCreateTask?: (title: string, destination: Destination, description?: string | null) => Promise<void> | void;
  onCreateSimpleTask?: (title: string, description?: string | null) => Promise<void> | void;
  onCancel?: () => void;
  destination?: Destination;
  placeholder?: string;
  buttonText?: string;
  defaultOpen?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function InlineTaskCreator({ onCreateTask, onCreateSimpleTask, onCancel, destination, placeholder = 'Nova tarefa...', buttonText = 'Adicionar Tarefa', defaultOpen = false, autoFocus, className }: InlineTaskCreatorProps) {
  const [isOpen, setIsOpen] = useState(!!defaultOpen);
  const [taskTitle, setTaskTitle] = useState('');
  // Descrição é opcional: só aparece se o usuário pedir, para não atrasar o 'digita e Enter'.
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const reset = useCallback(() => {
    setTaskTitle('');
    setDescription('');
    setShowDescription(false);
    setIsOpen(false);
  }, []);

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else {
      reset();
    }
  }, [onCancel, reset]);

  const handleCreateTask = useCallback(async () => {
    const trimmedTitle = taskTitle.trim();
    if (trimmedTitle) {
      const desc = description.trim() || null;
      setTaskTitle('');
      setDescription('');
      setShowDescription(false);
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
      if (onCreateSimpleTask) {
        await onCreateSimpleTask(trimmedTitle, desc);
      } else if (onCreateTask && destination) {
        await onCreateTask(trimmedTitle, destination, desc);
      }
      inputRef.current?.focus();
    }
  }, [taskTitle, description, onCreateTask, onCreateSimpleTask, destination]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateTask();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleCreateTask, handleCancel]);

  // Na descrição, Enter quebra linha; Ctrl/Cmd+Enter cria a tarefa.
  const handleDescriptionKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCreateTask();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleCreateTask, handleCancel]);

  const openDescription = useCallback(() => {
    setShowDescription(true);
    setTimeout(() => descriptionRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (isOpen && autoFocus !== false) {
      inputRef.current?.focus();
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      }
    }
  }, [isOpen, autoFocus]);

  const onInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    setTaskTitle((e.target as HTMLTextAreaElement).value);
    const el = e.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={cn("rounded-full h-7 text-xs gap-1 flex items-center text-muted-foreground hover:text-foreground", className)}
      >
        <Plus className="w-3.5 h-3.5" />
        {buttonText}
      </Button>
    );
  }

  return (
    <div className={cn("w-full", className)}>
    <div className="flex items-center gap-1 w-full">
      <textarea
        ref={inputRef}
        value={taskTitle}
        onInput={onInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className="flex-1 min-w-0 max-h-[80px] bg-transparent border-0 border-b border-border/60 text-[13px] outline-none resize-none overflow-y-auto py-0 leading-tight focus:border-primary transition-colors"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCreateTask}
        className="rounded-full h-7 w-7 text-muted-foreground hover:text-primary flex-shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
      {!showDescription && (
        <Button
          variant="ghost"
          size="icon"
          onClick={openDescription}
          title="Adicionar descrição"
          aria-label="Adicionar descrição"
          className="rounded-full h-7 w-7 text-muted-foreground hover:text-primary flex-shrink-0"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCancel}
        className="rounded-full h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
    {showDescription && (
      <div className="mt-1.5">
        <textarea
          ref={descriptionRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleDescriptionKeyDown}
          placeholder="O que deve ser feito? (opcional)"
          rows={3}
          className="w-full rounded-md border border-border/60 bg-transparent px-2 py-1.5 text-[12px] outline-none resize-y focus:border-primary transition-colors"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">Ctrl+Enter cria a tarefa</p>
      </div>
    )}
    </div>
  );
}

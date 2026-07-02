'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/app/lib/utils';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const reset = useCallback(() => {
    setTaskTitle('');
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
      setTaskTitle('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
      if (onCreateSimpleTask) {
        await onCreateSimpleTask(trimmedTitle);
      } else if (onCreateTask && destination) {
        await onCreateTask(trimmedTitle, destination);
      }
      inputRef.current?.focus();
    }
  }, [taskTitle, onCreateTask, onCreateSimpleTask, destination]);

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
    <div className={cn("flex items-center gap-1", className)}>
      <textarea
        ref={inputRef}
        value={taskTitle}
        onInput={onInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className="min-w-[120px] max-w-[300px] bg-transparent border-0 border-b border-border/60 text-[13px] outline-none resize-none overflow-hidden py-0 leading-tight focus:border-primary transition-colors"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCreateTask}
        className="rounded-full h-7 w-7 text-muted-foreground hover:text-primary flex-shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCancel}
        className="rounded-full h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

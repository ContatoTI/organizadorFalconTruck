'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import type { Destination } from './NewTaskDialog'; // Reutiliza o tipo Destination

interface InlineTaskCreatorProps {
  onCreateTask?: (title: string, destination: Destination) => Promise<void> | void;
  onCreateSimpleTask?: (title: string) => Promise<void> | void;
  destination?: Destination;
  placeholder?: string;
  buttonText?: string;
}

export function InlineTaskCreator({ onCreateTask, onCreateSimpleTask, destination, placeholder = 'Nova tarefa...', buttonText = 'Adicionar Tarefa' }: InlineTaskCreatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreateTask = useCallback(async () => {
    const trimmedTitle = taskTitle.trim();
    if (trimmedTitle) {
      if (onCreateSimpleTask) {
        await onCreateSimpleTask(trimmedTitle);
      } else if (onCreateTask && destination) {
        await onCreateTask(trimmedTitle, destination);
      }
      setTaskTitle('');
    }
  }, [taskTitle, onCreateTask, onCreateSimpleTask, destination]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateTask();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setTaskTitle('');
    }
  }, [handleCreateTask]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <Plus className="w-3.5 h-3.5" />
        {buttonText}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        type="text"
        value={taskTitle}
        onChange={(e) => setTaskTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setIsOpen(false);
          setTaskTitle('');
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

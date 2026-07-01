'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import type { Project, Group } from '@/types/index';

export type Destination =
  | { type: 'inbox' }
  | { type: 'project'; id: number }
  | { type: 'group'; id: number };

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  groups: Group[];
  onCreateTask: (title: string, description: string | null, destination: Destination) => void;
}

export function NewTaskDialog({ open, onOpenChange, projects, groups, onCreateTask }: NewTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destination, setDestination] = useState('inbox');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('O nome da tarefa é obrigatório');
      return;
    }

    let dest: Destination = { type: 'inbox' };
    if (destination.startsWith('project:')) {
      dest = { type: 'project', id: parseInt(destination.split(':')[1], 10) };
    } else if (destination.startsWith('group:')) {
      dest = { type: 'group', id: parseInt(destination.split(':')[1], 10) };
    }

    const titles = trimmed.split('\n').map(t => t.trim()).filter(Boolean);
    for (const t of titles) {
      onCreateTask(t, description.trim() || null, dest);
    }

    setTitle('');
    setDescription('');
    setDestination('inbox');
    setError('');
    onOpenChange(false);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      e.preventDefault();
      for (const t of lines) {
        onCreateTask(t, description.trim() || null, destination.startsWith('project:')
          ? { type: 'project', id: parseInt(destination.split(':')[1], 10) }
          : destination.startsWith('group:')
            ? { type: 'group', id: parseInt(destination.split(':')[1], 10) }
            : { type: 'inbox' });
      }
      setTitle('');
      setDescription('');
      setDestination('inbox');
      setError('');
      onOpenChange(false);
    }
  };

  const lists = groups.filter(g => g.type === 'list');
  const timeBlocks = groups.filter(g => g.type === 'time');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="space-y-4 py-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Nome *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(''); }}
              onPaste={handlePaste}
              placeholder="Digite o nome da tarefa"
              autoFocus
              className={error ? 'border-destructive' : ''}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Descrição</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Destino</Label>
            <Select value={destination} onValueChange={(v) => v && setDestination(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inbox">Caixa de Entrada</SelectItem>

                {projects.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Projetos</SelectLabel>
                    {projects.map(p => (
                      <SelectItem key={`project:${p.id}`} value={`project:${p.id}`}>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                          {p.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}

                {lists.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Listas</SelectLabel>
                    {lists.map(g => (
                      <SelectItem key={`group:${g.id}`} value={`group:${g.id}`}>
                        {g.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}

                {timeBlocks.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Blocos de Tempo</SelectLabel>
                    {timeBlocks.map(g => (
                      <SelectItem key={`group:${g.id}`} value={`group:${g.id}`}>
                        {g.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="text-[11px] text-amber-600 flex items-center gap-1">
            <span>💡</span>
            <span>Cole uma lista e crie várias tarefas de uma vez</span>
          </div>

          <DialogFooter className="pt-2">
            <Button type="submit" className="w-full">
              Criar tarefa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/src/lib/utils';
import { AlertCircle } from 'lucide-react';
import { PRIORITIES, priorityMeta, type PriorityValue } from '@/src/lib/priority';

interface PriorityPickerProps {
  value?: string | null;
  onChange: (value: PriorityValue | null) => void;
  /** Quando true, o ícone fica escondido até o hover da linha (para "adicionar"). */
  hideWhenEmpty?: boolean;
  className?: string;
}

/**
 * Ícone de exclamação clicável. Um clique abre a lista de níveis — é o caminho
 * mais curto para colocar ou trocar a prioridade sem abrir o painel da tarefa.
 */
export function PriorityPicker({ value, onChange, hideWhenEmpty = true, className }: PriorityPickerProps) {
  const meta = priorityMeta(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={meta ? `Prioridade ${meta.label}` : 'Definir prioridade'}
        title={meta ? `Prioridade: ${meta.label}` : 'Definir prioridade'}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'shrink-0 grid place-items-center h-6 w-6 rounded-md transition-all',
          'hover:bg-muted',
          meta
            ? meta.text
            : cn(
                'text-muted-foreground/40 hover:text-foreground',
                hideWhenEmpty &&
                  'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100',
              ),
          className,
        )}
      >
        <AlertCircle className="w-4 h-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuRadioGroup
          value={meta?.value ?? ''}
          onValueChange={(v) => onChange((v as PriorityValue) || null)}
        >
          {PRIORITIES.map((p) => (
            <DropdownMenuRadioItem key={p.value} value={p.value}>
              <span className={cn('w-2 h-2 rounded-full shrink-0', p.dot)} />
              {p.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {meta && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange(null)}>
              Remover prioridade
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

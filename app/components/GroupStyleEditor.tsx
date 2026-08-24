'use client';

import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn, PROJECT_COLORS, GROUP_EMOJIS } from '@/app/lib/utils';
import { Palette, Check } from 'lucide-react';

interface GroupStyleEditorProps {
  icon: string | null;
  color: string | null;
  /** Salva assim que o usuário escolhe — sem botão de confirmar. */
  onChange: (patch: { icon?: string | null; color?: string | null }) => void;
  /** Elemento que abre o editor. Sem ele, um botãozinho de paleta. */
  trigger?: React.ReactElement;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/**
 * Trocar a cara de um bloco, lista ou projeto em dois cliques.
 *
 * Antes isso só existia dentro do formulário de edição, o que obrigava a
 * abrir uma tela inteira para mudar um emoji. Aqui o editor viaja junto do
 * item: vive na sidebar, no cabeçalho da tela, onde o item aparecer.
 *
 * Cada escolha grava na hora. Não há "salvar" porque não há nada a confirmar —
 * trocar de cor é reversível com outro clique.
 */
export function GroupStyleEditor({
  icon, color, onChange, trigger, align = 'start', className,
}: GroupStyleEditorProps) {
  const [custom, setCustom] = useState('');

  return (
    <Popover>
      <PopoverTrigger
        render={
          trigger ?? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Trocar ícone e cor"
              title="Trocar ícone e cor"
              className={cn('text-muted-foreground hover:text-primary', className)}
            >
              <Palette className="w-3.5 h-3.5" />
            </Button>
          )
        }
      />

      <PopoverContent align={align} className="w-auto p-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Ícone
        </p>
        <div className="grid grid-cols-8 gap-1">
          {GROUP_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange({ icon: icon === emoji ? null : emoji })}
              aria-label={`Usar ${emoji}`}
              className={cn(
                'w-8 h-8 grid place-items-center rounded-md text-lg transition-colors hover:bg-accent',
                icon === emoji && 'bg-primary/15 ring-2 ring-primary'
              )}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim()) {
                onChange({ icon: custom.trim() });
                setCustom('');
              }
            }}
            placeholder="cole outro emoji"
            className="h-7 text-[12.5px]"
          />
          {icon && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onChange({ icon: null })}
              className="shrink-0"
            >
              Limpar
            </Button>
          )}
        </div>

        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-2">
          Cor
        </p>
        <div className="grid grid-cols-8 gap-1.5">
          {PROJECT_COLORS.map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ color: value })}
              aria-label={`Cor ${value}`}
              className={cn(
                'w-7 h-7 rounded-full grid place-items-center transition-transform justify-self-center',
                color === value && 'ring-2 ring-offset-2 ring-primary ring-offset-background scale-110'
              )}
              style={{ backgroundColor: value }}
            >
              {color === value && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

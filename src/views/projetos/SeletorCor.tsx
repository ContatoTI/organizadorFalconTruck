'use client';

import { cn, PROJECT_COLORS } from '@/src/lib/utils';

interface Props {
  valor: string;
  onChange: (cor: string) => void;
  disabled?: boolean;
}

/** Bolinhas de cor do projeto — usado ao criar e ao editar. */
export function SeletorCor({ valor, onChange, disabled }: Props) {
  return (
    <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Cor do projeto">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={valor === c}
          aria-label={`Cor ${c}`}
          disabled={disabled}
          onClick={() => onChange(c)}
          className={cn('w-7 h-7 rounded-full transition-transform', valor === c && 'ring-2 ring-offset-2 ring-primary scale-110')}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

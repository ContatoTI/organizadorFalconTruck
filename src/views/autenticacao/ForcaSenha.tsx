'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { avaliarSenha, type DadosPessoais, type ForcaSenha as Forca } from '@/src/models/autenticacao/regras';

const VISUAL: Record<Exclude<Forca, 'vazia'>, { rotulo: string; barras: number; cor: string; texto: string }> = {
  fraca: { rotulo: 'Fraca', barras: 1, cor: 'bg-destructive', texto: 'text-destructive' },
  media: { rotulo: 'Média', barras: 2, cor: 'bg-amber-500', texto: 'text-amber-600' },
  forte: { rotulo: 'Forte', barras: 3, cor: 'bg-green-500', texto: 'text-green-600' },
};

/** Barrinha de força + lista do que a senha precisa ter. */
export function ForcaSenha({ senha, pessoal }: { senha: string; pessoal?: DadosPessoais }) {
  const { forca, requisitos } = avaliarSenha(senha, pessoal);
  const visual = forca === 'vazia' ? null : VISUAL[forca];

  return (
    <div className="space-y-2" aria-live="polite">
      {visual && (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3].map(n => (
              <span key={n} className={cn('h-1.5 flex-1 rounded-full', n <= visual.barras ? visual.cor : 'bg-muted')} />
            ))}
          </div>
          <span className={cn('text-xs font-medium', visual.texto)}>{visual.rotulo}</span>
        </div>
      )}
      <ul className="space-y-0.5">
        {requisitos.map(r => (
          <li key={r.id} className={cn('flex items-center gap-1.5 text-xs', r.ok && senha ? 'text-green-600' : 'text-muted-foreground')}>
            {r.ok && senha ? <Check className="size-3 shrink-0" /> : <X className="size-3 shrink-0" />}
            {r.texto}
          </li>
        ))}
      </ul>
      {forca === 'media' && (
        <p className="text-xs text-muted-foreground">Dica: um símbolo (!@#) ou mais letras deixa a senha forte.</p>
      )}
    </div>
  );
}

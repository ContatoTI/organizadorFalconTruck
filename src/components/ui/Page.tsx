'use client';

import { cn } from '@/src/lib/utils';
import type { LucideIcon } from 'lucide-react';

/**
 * Casca padrão de página.
 *
 * Antes cada tela escolhia a própria largura, o próprio padding e o próprio
 * tamanho de título (3xl aqui, 19px ali). Isto aqui é a régua: toda tela do
 * app usa PageShell + PageHeader, e o resultado é que trocar de tela não
 * parece trocar de aplicativo.
 */

export function PageShell({
  children, size = 'md', className,
}: {
  children: React.ReactNode;
  /** md = listas e formulários · lg = tabelas e grades */
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Largura total da tela. O conteudo interno e que decide se abre em
        // colunas — limitar tudo a 1000px desperdicava metade de um monitor.
        'w-full px-4 sm:px-6 xl:px-8 py-5',
        // 'md' ainda segura a leitura de listas longas de texto corrido,
        // mas centralizado e sem travar telas largas.
        size === 'md' && 'mx-auto max-w-[1100px]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  icon: Icon, title, subtitle, actions, className,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-start gap-3 mb-4 flex-wrap', className)}>
      {Icon && (
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
          <Icon className="w-[18px] h-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[19px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-[12.5px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon: Icon, title, hint, action, className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-6 py-10 text-center', className)}>
      {Icon && <Icon className="w-8 h-8 mx-auto mb-3 text-muted-foreground/25" />}
      <p className="text-[13.5px] font-medium text-foreground/80">{title}</p>
      {hint && <p className="text-[12.5px] text-muted-foreground mt-1">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Contêiner de lista: uma borda só, linhas separadas por dentro. */
export function ListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      {children}
    </div>
  );
}

/** Uma linha de lista — mesma altura e mesmos hovers em todas as telas. */
export function ListRow({
  children, onClick, className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group/row flex items-center gap-2.5 px-3 py-2.5 border-b border-border/50 last:border-b-0 transition-colors',
        onClick && 'cursor-pointer hover:bg-accent/50',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Esqueleto de carregamento — sempre o mesmo, em toda tela. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-48 rounded-lg bg-muted animate-pulse mb-4" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

/** Botão de ação que só aparece no hover da linha. */
export function RowAction({
  icon: Icon, label, onClick, danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      title={label}
      className={cn(
        'shrink-0 p-1.5 rounded-md text-muted-foreground/40 transition-all',
        'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
        danger ? 'hover:text-destructive hover:bg-destructive/10' : 'hover:text-primary hover:bg-primary/10'
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/app/lib/utils';
import { parseCapture, describeWhen, splitPastedLines, type ParsedCapture } from '@/app/lib/quickParse';
import { CornerDownLeft, Inbox, Clock, List as ListIcon, Folder, Zap, X, Repeat } from 'lucide-react';
import { describeRecurrence } from '@/app/lib/recurrence';
import type { Task } from '@/types/index';

export type CaptureTargetKind = 'inbox' | 'group-time' | 'group-list' | 'project';

export interface CaptureTarget {
  /** 'inbox' | 'group:12' | 'project:3' */
  key: string;
  label: string;
  kind: CaptureTargetKind;
  color?: string | null;
  /** Só para blocos de tempo: "12:00 – 13:30" */
  timeLabel?: string | null;
}

export interface CaptureDraft extends ParsedCapture {
  targetKey: string;
}

interface QuickCaptureProps {
  targets: CaptureTarget[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  /** Cria N tarefas de uma vez. Deve resolver só depois de salvar. */
  onCreate: (drafts: CaptureDraft[]) => Promise<void> | void;
  className?: string;
}

const KIND_ICON = {
  'inbox': Inbox,
  'group-time': Clock,
  'group-list': ListIcon,
  'project': Folder,
} as const;

export function QuickCapture({ targets, activeKey, onActiveKeyChange, onCreate, className }: QuickCaptureProps) {
  const [value, setValue] = useState('');
  const [pastedLines, setPastedLines] = useState<string[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTarget = targets.find(t => t.key === activeKey) ?? targets[0];

  // ── O cursor vive dentro do campo ────────────────────────────────────────
  // Foco ao montar e sempre que a janela volta. Qualquer tecla imprimível
  // digitada fora de um input também traz o foco de volta para cá.
  useEffect(() => {
    inputRef.current?.focus();

    const refocus = () => {
      if (document.activeElement === document.body) inputRef.current?.focus();
    };
    window.addEventListener('focus', refocus);

    const onGlobalKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typingElsewhere =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typingElsewhere) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Só reage a caractere imprimível — assim atalhos e navegação por Tab
      // continuam funcionando normalmente.
      if (e.key.length !== 1) return;
      // Com modal ou painel de detalhe aberto, o teclado é deles. Sem isto,
      // digitar no painel da tarefa puxaria o texto para a captura.
      if (document.querySelector('[role="dialog"], [data-detail-panel]')) return;
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onGlobalKey);

    return () => {
      window.removeEventListener('focus', refocus);
      document.removeEventListener('keydown', onGlobalKey);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Ctrl/⌘ + 1..9 troca o destino sem tirar a mão do teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const n = parseInt(e.key, 10);
      if (isNaN(n) || n < 1 || n > 9) return;
      const target = targets[n - 1];
      if (!target) return;
      e.preventDefault();
      onActiveKeyChange(target.key);
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [targets, onActiveKeyChange]);

  const preview = useMemo(() => (value.trim() ? parseCapture(value) : null), [value]);
  const whenLabel = preview ? describeWhen(preview) : null;

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  }, []);

  const autoGrow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  const commit = useCallback(async (titles: string[]) => {
    const drafts: CaptureDraft[] = titles
      .map(t => ({ ...parseCapture(t), targetKey: activeKey }))
      .filter(d => d.title.trim());
    if (drafts.length === 0) return;

    // Limpa na hora: a próxima tarefa já pode ser digitada enquanto salva.
    setValue('');
    setPastedLines(null);
    requestAnimationFrame(() => {
      autoGrow();
      inputRef.current?.focus();
    });

    setSaving(true);
    try {
      await onCreate(drafts);
      showFlash(
        drafts.length === 1
          ? `“${drafts[0].title}” em ${activeTarget?.label ?? 'Caixa de Entrada'}`
          : `${drafts.length} tarefas em ${activeTarget?.label ?? 'Caixa de Entrada'}`
      );
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  }, [activeKey, activeTarget, onCreate, autoGrow, showFlash]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return; // linha única: comportamento normal

    const lines = splitPastedLines(text);
    if (lines.length < 2) return;

    e.preventDefault();
    setPastedLines(lines);
    setValue(text.trim());
    requestAnimationFrame(autoGrow);
  }, [autoGrow]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Confirmação da colagem em lote: Enter cria todas, Esc vira uma só.
    if (pastedLines) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit(pastedLines);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPastedLines(null);
        setValue(v => v.replace(/\s*\r?\n\s*/g, ' ').trim());
        requestAnimationFrame(autoGrow);
        return;
      }
      // Editou o texto? Recalcula as linhas na próxima renderização.
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const raw = value.trim();
      if (!raw) return;
      commit(raw.includes('\n') ? splitPastedLines(raw) : [raw]);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setValue('');
      requestAnimationFrame(autoGrow);
    }
  }, [pastedLines, value, commit, autoGrow]);

  // Se o usuário editar o texto colado, mantém a contagem de linhas em dia.
  useEffect(() => {
    if (!pastedLines) return;
    const lines = splitPastedLines(value);
    if (lines.length < 2) {
      setPastedLines(null);
    } else if (lines.length !== pastedLines.length || lines.some((l, i) => l !== pastedLines[i])) {
      setPastedLines(lines);
    }
  }, [value, pastedLines]);

  const ActiveIcon = KIND_ICON[activeTarget?.kind ?? 'inbox'];

  return (
    <div className={cn('w-full', className)}>
      {/* ── Destinos: clique antes de digitar e a tarefa já nasce no lugar ──
          Com um destino só (dentro de um bloco ou projeto) a fileira some:
          não há escolha a fazer, e o ícone do campo já diz onde a tarefa cai. */}
      <div className={cn('flex items-center gap-1.5 flex-wrap mb-2', targets.length < 2 && 'hidden')}>
        {targets.map((t, i) => {
          const Icon = KIND_ICON[t.kind];
          const active = t.key === activeKey;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => { onActiveKeyChange(t.key); inputRef.current?.focus(); }}
              title={t.timeLabel ? `${t.label} · ${t.timeLabel}` : t.label}
              className={cn(
                'group flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border text-[12px] transition-all',
                active
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
              style={active ? { backgroundColor: t.color || 'hsl(var(--primary))' } : undefined}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" style={!active && t.color ? { color: t.color } : undefined} />
              <span className="truncate max-w-[140px]">{t.label}</span>
              {i < 9 && (
                <kbd
                  className={cn(
                    'hidden md:inline text-[9px] leading-none px-1 py-0.5 rounded font-mono',
                    active ? 'bg-white/20' : 'bg-muted text-muted-foreground/70'
                  )}
                >
                  {i + 1}
                </kbd>
              )}
            </button>
          );
        })}
      </div>

      {/* ── O campo ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'relative rounded-xl border-2 bg-card transition-colors',
          pastedLines ? 'border-amber-400' : 'border-primary/30 focus-within:border-primary'
        )}
      >
        <div className="flex items-start gap-2.5 px-3 py-2.5">
          <ActiveIcon
            className="w-[18px] h-[18px] mt-[3px] shrink-0"
            style={{ color: activeTarget?.color || 'hsl(var(--primary))' }}
          />
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); autoGrow(); }}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            rows={1}
            spellCheck={false}
            placeholder={`O que você precisa fazer? (cai em ${activeTarget?.label ?? 'Caixa de Entrada'})`}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none resize-none text-[15px] leading-6 placeholder:text-muted-foreground/50 max-h-[160px] overflow-y-auto"
          />
          {value && (
            <button
              type="button"
              onClick={() => { setValue(''); setPastedLines(null); inputRef.current?.focus(); }}
              className="mt-[3px] p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted shrink-0"
              title="Limpar (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ── Confirmação da colagem em lote ──────────────────────────── */}
        {pastedLines && (
          <div className="flex items-center gap-2 px-3 py-2 border-t border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 rounded-b-[10px]">
            <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-[13px] text-amber-900 dark:text-amber-200 flex-1">
              Colei <strong>{pastedLines.length} linhas</strong>. Criar {pastedLines.length} tarefas?
            </span>
            <kbd className="text-[10px] font-mono px-1.5 py-1 rounded bg-amber-600 text-white flex items-center gap-1">
              Enter <CornerDownLeft className="w-3 h-3" />
            </kbd>
            <kbd className="text-[10px] font-mono px-1.5 py-1 rounded bg-white/70 dark:bg-black/30 text-amber-900 dark:text-amber-200 border border-amber-400/50">
              Esc = 1 só
            </kbd>
          </div>
        )}
      </div>

      {/* ── Rodapé: o que o sistema entendeu / o que acabou de salvar ──── */}
      <div className="flex items-center gap-2 mt-1.5 min-h-[20px] px-1 text-[12px]">
        {whenLabel && !pastedLines && (
          <span className="inline-flex items-center gap-1 text-primary font-medium">
            <Clock className="w-3 h-3" /> {whenLabel}
          </span>
        )}
        {preview?.recur && !pastedLines && (
          <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium">
            {/* Tarefa ainda não existe: monta o mínimo que describeRecurrence lê. */}
            <Repeat className="w-3 h-3" /> {describeRecurrence({
              recur_freq: preview.recur.freq,
              recur_interval: 1,
              recur_weekdays: preview.recur.weekdays.length > 0 ? preview.recur.weekdays : null,
              due_at: preview.dueAt ? preview.dueAt.toISOString() : null,
              due_date: preview.dueDate,
            } as Task)}
          </span>
        )}
        {preview?.priority && !pastedLines && (
          <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 font-medium capitalize">
            ! {preview.priority}
          </span>
        )}
        {flash && !value && (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            ✓ {flash}
          </span>
        )}
        {!whenLabel && !flash && !value && !pastedLines && (
          <span className="text-muted-foreground/50">
            Enter salva e já abre a próxima · cole uma lista para criar várias · tente “toda terça 15h”
          </span>
        )}
        {saving && <span className="ml-auto text-muted-foreground/50">salvando…</span>}
      </div>
    </div>
  );
}

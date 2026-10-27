'use client';

import { useState } from 'react';
import { cn } from '@/src/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeRecurrence } from '@/src/models/tarefas/recurrence';
import type { Task, RecurFreq } from '@/types/index';
import { Repeat, X, ChevronDown, ChevronUp } from 'lucide-react';

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;

const FREQ_OPTIONS: Array<{ value: RecurFreq; label: string }> = [
  { value: 'daily', label: 'Dia' },
  { value: 'weekly', label: 'Semana' },
  { value: 'monthly', label: 'Mês' },
  { value: 'yearly', label: 'Ano' },
];

export interface RecurrenceRule {
  freq: RecurFreq | null;
  interval: number;
  weekdays: number[];
  until: string | null;
  count: number | null;
}

export function ruleFromTask(task: Task): RecurrenceRule {
  const raw = task.recur_weekdays as unknown;
  let weekdays: number[] = [];
  if (Array.isArray(raw)) {
    weekdays = raw.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6);
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) weekdays = parsed.filter((d: unknown): d is number => typeof d === 'number');
    } catch { /* jsonb inválido: trata como sem dias */ }
  }

  return {
    freq: (task.recur_freq as RecurFreq | null) ?? null,
    interval: Math.max(1, task.recur_interval ?? 1),
    weekdays,
    until: task.recur_until ?? null,
    count: task.recur_count ?? null,
  };
}

interface RecurrenceEditorProps {
  task: Task;
  /** Grava a regra. Chamado a cada mudança — não há botão de confirmar. */
  onChange: (rule: RecurrenceRule) => void;
  /** Sem data marcada não há de onde a série partir. */
  disabled?: boolean;
}

/**
 * "Isso se repete?"
 *
 * Um compromisso que volta toda terça não deveria virar sete tarefas soltas.
 * Aqui você marca a frequência uma vez e o calendário passa a desenhar a
 * série inteira — continuando a ser uma linha só para editar depois.
 *
 * A série sempre parte da data da própria tarefa: sem data marcada, não há
 * âncora, e o editor fica desabilitado explicando isso.
 */
export function RecurrenceEditor({ task, onChange, disabled }: RecurrenceEditorProps) {
  const rule = ruleFromTask(task);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const apply = (patch: Partial<RecurrenceRule>) => onChange({ ...rule, ...patch });

  const anchorWeekday = task.due_at
    ? new Date(task.due_at).getDay()
    : task.due_date
      ? new Date(task.due_date + 'T00:00:00').getDay()
      : null;

  if (disabled) {
    return (
      <div>
        <Label className="cursor-default">Repetir</Label>
        <p className="text-[11.5px] text-muted-foreground mt-1">
          Escolha uma data acima para poder repetir este compromisso.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="cursor-default">Repetir</Label>
        {rule.freq && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onChange({ freq: null, interval: 1, weekdays: [], until: null, count: null })}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="w-3 h-3" /> Não repetir
          </Button>
        )}
      </div>

      {/* ── Frequência: nunca / dia / semana / mês / ano ────────────── */}
      <div className="flex gap-1 min-w-0">
        <Button
          type="button"
          variant={rule.freq === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange({ freq: null, interval: 1, weekdays: [], until: null, count: null })}
          className="h-8 flex-1 shrink min-w-0 px-1 text-[12px]"
        >
          Nunca
        </Button>
        {FREQ_OPTIONS.map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            variant={rule.freq === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => apply({
              freq: value,
              // Ao escolher "semana", já marca o dia da própria data — é o que
              // "toda terça" significa quando a tarefa cai numa terça.
              weekdays: value === 'weekly' && rule.weekdays.length === 0 && anchorWeekday !== null
                ? [anchorWeekday]
                : rule.weekdays,
            })}
            className="h-8 flex-1 shrink min-w-0 px-1 text-[12px]"
          >
            {label}
          </Button>
        ))}
      </div>

      {rule.freq && (
        <div className="mt-2.5 space-y-2.5 rounded-lg border border-border p-2.5">
          {/* ── Dias da semana ───────────────────────────────────── */}
          {rule.freq === 'weekly' && (
            <div>
              <p className="text-[11.5px] text-muted-foreground mb-1.5">Em quais dias?</p>
              <div className="flex gap-1 min-w-0">
                {DAY_LABELS.map((label, index) => {
                  const active = rule.weekdays.includes(index);
                  return (
                    <Button
                      key={index}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => apply({
                        weekdays: active
                          ? rule.weekdays.filter(d => d !== index)
                          : [...rule.weekdays, index].sort((a, b) => a - b),
                      })}
                      aria-label={DAY_NAMES[index]}
                      aria-pressed={active}
                      className="h-8 flex-1 shrink min-w-0 p-0 text-[12px]"
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Intervalo ────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-muted-foreground shrink-0">A cada</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={rule.interval}
              onChange={(e) => apply({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              className="h-7 w-16 text-[12.5px] tabular-nums"
            />
            <span className="text-[11.5px] text-muted-foreground">
              {rule.freq === 'daily' ? 'dia(s)'
                : rule.freq === 'weekly' ? 'semana(s)'
                : rule.freq === 'monthly' ? 'mês(es)'
                : 'ano(s)'}
            </span>
          </div>

          {/* ── Fim da série ─────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Quando termina
            {!showAdvanced && (rule.until || rule.count) && (
              <span className="text-primary">· definido</span>
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-muted-foreground w-12 shrink-0">Até</span>
                <Input
                  type="date"
                  value={rule.until ?? ''}
                  onChange={(e) => apply({ until: e.target.value || null, count: null })}
                  className="h-7 flex-1 text-[12.5px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-muted-foreground w-12 shrink-0">Ou</span>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  placeholder="nº de vezes"
                  value={rule.count ?? ''}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    apply({ count: isNaN(value) || value < 1 ? null : value, until: null });
                  }}
                  className="h-7 w-24 text-[12.5px] tabular-nums"
                />
                <span className="text-[11.5px] text-muted-foreground">vezes</span>
              </div>
              {(rule.until || rule.count) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => apply({ until: null, count: null })}
                  className="text-muted-foreground"
                >
                  Não terminar nunca
                </Button>
              )}
            </div>
          )}

          {/* ── O que ficou valendo, em português ────────────────── */}
          <p className="flex items-center gap-1.5 text-[11.5px] text-primary pt-0.5 border-t border-border">
            <Repeat className="w-3 h-3 shrink-0" />
            {describeRecurrence({ ...task, ...ruleToTask(rule) }) ?? 'Sem repetição'}
          </p>
        </div>
      )}
    </div>
  );
}

/** Converte a regra do editor de volta para os campos da tarefa. */
export function ruleToTask(rule: RecurrenceRule): Partial<Task> {
  return {
    recur_freq: rule.freq,
    recur_interval: rule.interval,
    recur_weekdays: rule.freq === 'weekly' && rule.weekdays.length > 0 ? rule.weekdays : null,
    recur_until: rule.until,
    recur_count: rule.count,
  };
}

/** Selo curto de repetição, para caber ao lado de um título. */
export function RecurrenceBadge({ task, className }: { task: Task; className?: string }) {
  const label = describeRecurrence(task);
  if (!label) return null;

  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md',
        'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
        className
      )}
      title={label}
    >
      <Repeat className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

/**
 * Prioridade da tarefa — fonte única.
 *
 * Os mesmos quatro níveis aparecem na captura rápida (!alta), no painel de
 * detalhe, no menu de ações e no ícone de exclamação da linha. Manter a lista
 * aqui evita que cada tela invente o seu próprio conjunto de cores/rótulos.
 */

export type PriorityValue = 'baixa' | 'media' | 'alta' | 'urgente';

export interface PriorityMeta {
  value: PriorityValue;
  label: string;
  /** Bolinha sólida (usada no select e no menu). */
  dot: string;
  /** Cor do ícone de exclamação na linha da tarefa. */
  text: string;
}

export const PRIORITIES: PriorityMeta[] = [
  { value: 'baixa', label: 'Baixa', dot: 'bg-slate-400', text: 'text-slate-500' },
  { value: 'media', label: 'Média', dot: 'bg-amber-400', text: 'text-amber-500' },
  { value: 'alta', label: 'Alta', dot: 'bg-orange-500', text: 'text-orange-500' },
  { value: 'urgente', label: 'Urgente', dot: 'bg-red-500', text: 'text-red-500' },
];

export function priorityMeta(value?: string | null): PriorityMeta | null {
  return PRIORITIES.find((p) => p.value === value) ?? null;
}

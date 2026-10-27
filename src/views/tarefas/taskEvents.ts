/**
 * Event bus global para movimentacao de tarefas entre lista/bloco/projeto.
 *
 * Quando uma tarefa e movida (drag-and-drop, edicao via dialog, etc),
 * o componente que originou o move atualiza seu estado local e emite
 * um evento para que os OUTROS componentes que mostram a mesma tarefa
 * possam atualizar apenas o item especifico, sem refetch completo.
 *
 * Tambem emite evento de erro para permitir revert visual.
 */
import type { Task } from '@/types/index';

export interface TaskMovedEvent {
  /** ID da tarefa que se moveu */
  taskId: number;
  /** Estado FINAL da tarefa apos o move (snapshot para atualizacao otimista) */
  taskSnapshot: Task;
  /** Contexto de origem (pre-move) para fins de log/auditoria */
  from: {
    viewGroupId: number | null;
    projectId: number | null;
    sectionId: number | null;
    linkedViewGroupIds?: number[];
  };
}

export interface TaskMoveErrorEvent {
  /** ID da tarefa que falhou ao mover */
  taskId: number;
  /** Estado ORIGINAL (pre-move) usado para reverter */
  originalTask: Task;
  /** Mensagem de erro retornada pelo servidor */
  error: string;
}

const TASK_MOVED_EVENT = 'task-moved';
const TASK_MOVE_ERROR_EVENT = 'task-move-error';

/**
 * Suprime a reacao do listener de realtime (fetchTasks) por um periodo
 * apos um move otimista, para evitar reflash visual.
 *
 * Cada pagina deve chamar isto ao receber `task-moved` e checar no
 * callback de realtime se ha skip ativo.
 */
const SKIP_REALTIME_KEY = '__taskMoveSkipUntil';

export function skipRealtimeFetch(durationMs: number = 1500): void {
  if (typeof window === 'undefined') return;
  const until = Date.now() + durationMs;
  // Mantem o maior valor para suportar moves concorrentes
  const current = (window as unknown as Record<string, number>)[SKIP_REALTIME_KEY] || 0;
  if (until > current) {
    (window as unknown as Record<string, number>)[SKIP_REALTIME_KEY] = until;
  }
}

export function shouldSkipRealtimeFetch(): boolean {
  if (typeof window === 'undefined') return false;
  const until = (window as unknown as Record<string, number>)[SKIP_REALTIME_KEY] || 0;
  return Date.now() < until;
}

export function emitTaskMoved(detail: TaskMovedEvent): void {
  if (typeof window === 'undefined') return;
  skipRealtimeFetch(2000);
  window.dispatchEvent(new CustomEvent<TaskMovedEvent>(TASK_MOVED_EVENT, { detail }));
}

export function emitTaskMoveError(detail: TaskMoveErrorEvent): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TaskMoveErrorEvent>(TASK_MOVE_ERROR_EVENT, { detail }));
}

export function onTaskMoved(handler: (detail: TaskMovedEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<TaskMovedEvent>).detail);
  window.addEventListener(TASK_MOVED_EVENT, listener);
  return () => window.removeEventListener(TASK_MOVED_EVENT, listener);
}

export function onTaskMoveError(handler: (detail: TaskMoveErrorEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<TaskMoveErrorEvent>).detail);
  window.addEventListener(TASK_MOVE_ERROR_EVENT, listener);
  return () => window.removeEventListener(TASK_MOVE_ERROR_EVENT, listener);
}
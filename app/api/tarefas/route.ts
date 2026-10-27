import { listarTarefas, criarTarefa } from '@/src/controllers/tarefas/tarefas';

export const GET = (req: Request) => listarTarefas(req);
export const POST = (req: Request) => criarTarefa(req);

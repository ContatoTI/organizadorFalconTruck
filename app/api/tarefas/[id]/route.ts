import { buscarTarefa, atualizarTarefa, excluirTarefa } from '@/src/controllers/tarefas/tarefas';

type Contexto = { params: Promise<{ id: string }> };

export const GET = async (req: Request, { params }: Contexto) => buscarTarefa(req, (await params).id);
export const PATCH = async (req: Request, { params }: Contexto) => atualizarTarefa(req, (await params).id);
export const DELETE = async (_req: Request, { params }: Contexto) => excluirTarefa((await params).id);

import { listarGruposDaTarefa } from '@/src/controllers/tarefas/tarefas';

type Contexto = { params: Promise<{ id: string }> };

export const GET = async (_req: Request, { params }: Contexto) => listarGruposDaTarefa((await params).id);

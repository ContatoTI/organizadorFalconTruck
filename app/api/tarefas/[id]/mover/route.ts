import { moverTarefa } from '@/src/controllers/tarefas/tarefas';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => moverTarefa(req, (await params).id);

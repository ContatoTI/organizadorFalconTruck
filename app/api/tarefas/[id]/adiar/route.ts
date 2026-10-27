import { adiarTarefa } from '@/src/controllers/tarefas/tarefas';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => adiarTarefa(req, (await params).id);

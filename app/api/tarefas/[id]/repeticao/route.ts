import { repetirTarefa } from '@/src/controllers/tarefas/tarefas';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => repetirTarefa(req, (await params).id);

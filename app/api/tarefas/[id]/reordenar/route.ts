import { reordenarTarefa } from '@/src/controllers/tarefas/tarefas';

type Contexto = { params: Promise<{ id: string }> };

export const POST = async (req: Request, { params }: Contexto) => reordenarTarefa(req, (await params).id);

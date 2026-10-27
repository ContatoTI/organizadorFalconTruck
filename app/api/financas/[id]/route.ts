import { atualizarLancamento, excluirLancamento } from '@/src/controllers/financas/lancamentos';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => atualizarLancamento(req, (await params).id);
export const DELETE = async (_req: Request, { params }: Contexto) => excluirLancamento((await params).id);

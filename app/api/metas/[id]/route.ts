import { atualizarMeta, excluirMeta } from '@/src/controllers/metas/metas';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => atualizarMeta(req, (await params).id);
export const DELETE = async (_req: Request, { params }: Contexto) => excluirMeta((await params).id);

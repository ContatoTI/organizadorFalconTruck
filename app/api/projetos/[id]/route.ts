import { atualizarProjeto, excluirProjeto } from '@/src/controllers/projetos/projetos';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => atualizarProjeto(req, (await params).id);
export const DELETE = async (_req: Request, { params }: Contexto) => excluirProjeto((await params).id);

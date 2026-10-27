import { atualizarPasta, excluirPasta } from '@/src/controllers/projetos/pastas';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => atualizarPasta(req, (await params).id);
export const DELETE = async (_req: Request, { params }: Contexto) => excluirPasta((await params).id);

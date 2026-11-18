import { listarResponsaveis, definirResponsaveis } from '@/src/controllers/tarefas/responsaveis';

type Contexto = { params: Promise<{ id: string }> };

export const GET = async (_req: Request, { params }: Contexto) => listarResponsaveis((await params).id);
export const PUT = async (req: Request, { params }: Contexto) => definirResponsaveis(req, (await params).id);

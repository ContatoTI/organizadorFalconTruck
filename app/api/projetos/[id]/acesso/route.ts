import { verAcesso } from '@/src/controllers/projetos/projetos';

type Contexto = { params: Promise<{ id: string }> };

export const GET = async (_req: Request, { params }: Contexto) => verAcesso((await params).id);

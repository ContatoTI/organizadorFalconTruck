import { listarMembros } from '@/src/controllers/projetos/membros';

type Contexto = { params: Promise<{ id: string }> };

export const GET = async (_req: Request, { params }: Contexto) => listarMembros((await params).id);

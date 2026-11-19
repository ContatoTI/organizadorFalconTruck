import { sairDoProjeto } from '@/src/controllers/projetos/membros';

type Contexto = { params: Promise<{ id: string }> };

export const POST = async (_req: Request, { params }: Contexto) => sairDoProjeto((await params).id);

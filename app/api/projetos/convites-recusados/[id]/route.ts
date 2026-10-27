import { apagarRecusa } from '@/src/controllers/projetos/membros';

type Contexto = { params: Promise<{ id: string }> };

export const DELETE = async (_req: Request, { params }: Contexto) => apagarRecusa((await params).id);

import { resolverRevisao } from '@/src/controllers/notificacoes/notificacoes';

type Contexto = { params: Promise<{ id: string }> };

export const POST = async (req: Request, { params }: Contexto) => resolverRevisao(req, (await params).id);

import { recusarConvite } from '@/src/controllers/notificacoes/notificacoes';

type Contexto = { params: Promise<{ id: string }> };

export const POST = async (_req: Request, { params }: Contexto) => recusarConvite((await params).id);

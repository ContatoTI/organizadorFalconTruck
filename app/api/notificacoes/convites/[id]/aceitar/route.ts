import { aceitarConvite } from '@/src/controllers/notificacoes/notificacoes';

type Contexto = { params: Promise<{ id: string }> };

export const POST = async (_req: Request, { params }: Contexto) => aceitarConvite((await params).id);

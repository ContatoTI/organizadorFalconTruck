import { dispensarAviso } from '@/src/controllers/notificacoes/notificacoes';

type Contexto = { params: Promise<{ id: string }> };

export const DELETE = async (_req: Request, { params }: Contexto) => dispensarAviso((await params).id);

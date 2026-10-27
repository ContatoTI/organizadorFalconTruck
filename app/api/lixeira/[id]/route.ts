import { excluirDefinitivo } from '@/src/controllers/lixeira/lixeira';

type Contexto = { params: Promise<{ id: string }> };

export const DELETE = async (_req: Request, { params }: Contexto) => excluirDefinitivo((await params).id);

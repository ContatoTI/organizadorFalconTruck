import { restaurarTarefa } from '@/src/controllers/lixeira/lixeira';

type Contexto = { params: Promise<{ id: string }> };

export const POST = async (_req: Request, { params }: Contexto) => restaurarTarefa((await params).id);

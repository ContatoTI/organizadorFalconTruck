import { agendarTarefa } from '@/src/controllers/calendario/agenda';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => agendarTarefa(req, (await params).id);

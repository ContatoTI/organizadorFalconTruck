import { moverPasta } from '@/src/controllers/projetos/pastas';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => moverPasta(req, (await params).id);

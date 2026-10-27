import { listarPastas, criarPasta } from '@/src/controllers/projetos/pastas';

type Contexto = { params: Promise<{ id: string }> };

export const GET = async (_req: Request, { params }: Contexto) => listarPastas((await params).id);
export const POST = async (req: Request, { params }: Contexto) => criarPasta(req, (await params).id);

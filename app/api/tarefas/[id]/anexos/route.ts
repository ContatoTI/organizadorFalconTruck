import { listarAnexos, enviarAnexo } from '@/src/controllers/tarefas/anexos';

type Contexto = { params: Promise<{ id: string }> };

export const GET = async (_req: Request, { params }: Contexto) => listarAnexos((await params).id);
export const POST = async (req: Request, { params }: Contexto) => enviarAnexo(req, (await params).id);

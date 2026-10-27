import { atualizarGrupo, excluirGrupo } from '@/src/controllers/grupos/grupos';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => atualizarGrupo(req, (await params).id);
export const DELETE = async (_req: Request, { params }: Contexto) => excluirGrupo((await params).id);

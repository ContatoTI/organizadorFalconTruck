import { atualizarHabito, excluirHabito } from '@/src/controllers/habitos/habitos';

type Contexto = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => atualizarHabito(req, (await params).id);
export const DELETE = async (_req: Request, { params }: Contexto) => excluirHabito((await params).id);

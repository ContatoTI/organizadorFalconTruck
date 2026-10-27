import { listarAcessos } from '@/src/controllers/compartilhamentos/compartilhamentos';

type Contexto = { params: Promise<{ tipo: string; id: string }> };

export const GET = async (_req: Request, { params }: Contexto) => {
  const { tipo, id } = await params;
  return listarAcessos(tipo, id);
};

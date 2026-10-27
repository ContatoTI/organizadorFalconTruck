import { definirResponsavel } from '@/src/controllers/compartilhamentos/compartilhamentos';

type Contexto = { params: Promise<{ tipo: string; id: string }> };

export const PATCH = async (req: Request, { params }: Contexto) => {
  const { tipo, id } = await params;
  return definirResponsavel(req, tipo, id);
};

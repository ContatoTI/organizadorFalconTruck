import { marcarOcorrencia } from '@/src/controllers/calendario/agenda';

type Contexto = { params: Promise<{ tarefaId: string; data: string }> };

export const PUT = async (req: Request, { params }: Contexto) => {
  const { tarefaId, data } = await params;
  return marcarOcorrencia(req, tarefaId, data);
};

import { listarOcorrencias } from '@/src/controllers/calendario/agenda';

export const GET = (req: Request) => listarOcorrencias(req);

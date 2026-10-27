import { listarTarefasDasMetas } from '@/src/controllers/metas/metas';

export const GET = (req: Request) => listarTarefasDasMetas(req);

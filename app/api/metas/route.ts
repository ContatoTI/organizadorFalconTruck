import { listarMetas, criarMeta } from '@/src/controllers/metas/metas';

export const GET = () => listarMetas();
export const POST = (req: Request) => criarMeta(req);

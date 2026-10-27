import { listarPerfis } from '@/src/controllers/perfis/perfis';

export const GET = (req: Request) => listarPerfis(req);

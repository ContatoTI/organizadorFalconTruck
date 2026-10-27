import { buscarPreferencias, salvarPreferencias } from '@/src/controllers/preferencias/preferencias';

export const GET = () => buscarPreferencias();
export const PUT = (req: Request) => salvarPreferencias(req);

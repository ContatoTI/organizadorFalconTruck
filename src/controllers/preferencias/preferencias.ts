import * as preferencias from '@/src/models/preferencias/preferencias';
import { exigirLogin, lerJson, tratar } from '../sessao';

export function buscarPreferencias() {
  return tratar('carregar as preferências', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await preferencias.buscar(sessao.db, sessao.usuario.id));
  });
}

export function salvarPreferencias(request: Request) {
  return tratar('salvar as preferências', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await preferencias.salvar(sessao.db, sessao.usuario.id, preferencias.normalizar(await lerJson(request)));
    return new Response(null, { status: 204 });
  });
}

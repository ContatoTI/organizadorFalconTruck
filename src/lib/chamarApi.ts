/** Chamada às rotas /api do sistema. Resposta de erro vira Error com a mensagem do servidor. */
export async function chamarApi<T = void>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...resto } = init;
  const resp = await fetch(url, json === undefined ? resto : {
    ...resto,
    headers: { 'Content-Type': 'application/json', ...resto.headers },
    body: JSON.stringify(json),
  });
  if (!resp.ok) {
    const corpo = await resp.json().catch(() => null);
    throw new Error(corpo?.erro ?? `Erro ${resp.status}`);
  }
  return (resp.status === 204 ? undefined : await resp.json()) as T;
}

export type Resultado = { success: boolean; error?: string };

/** Formato de retorno usado pelas telas: nunca lança, devolve success/error. */
export async function comoResultado(acao: () => Promise<unknown>): Promise<Resultado> {
  try {
    await acao();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Regras puras das telas de projeto (sem React, sem rede) — fáceis de testar.
 */

export interface ModeloPastas {
  nome: string;
  pastas: string[];
}

/** Modelos prontos de pastas para um projeto novo. */
export const MODELOS_PASTAS: ModeloPastas[] = [
  { nome: 'Etapas simples', pastas: ['Planejar', 'Executar', 'Entregar'] },
  { nome: 'Por área', pastas: ['Compras', 'Produção', 'Vendas'] },
  { nome: 'Por semana', pastas: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'] },
];

/** Texto livre (uma pasta por linha) → nomes limpos, sem vazios nem repetidos. */
export function pastasDoTexto(texto: string): string[] {
  const vistos = new Set<string>();
  return texto
    .split('\n')
    .map(s => s.trim())
    .filter(s => {
      const chave = s.toLowerCase();
      if (!s || vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
}

/** Nome válido para criar: não pode ser vazio. Devolve o erro ou null. */
export function erroNomeProjeto(nome: string): string | null {
  return nome.trim() ? null : 'Dê um nome ao projeto.';
}

/** Confirmação de exclusão: o usuário precisa digitar o nome do projeto (ignora maiúsculas e espaços nas pontas). */
export function confirmaExclusao(nomeProjeto: string, digitado: string): boolean {
  return digitado.trim().toLowerCase() === nomeProjeto.trim().toLowerCase() && digitado.trim() !== '';
}

/** Requisitos de senha forte. Mudar aqui muda em todas as telas. */
export const CONFIG_SENHA = {
  tamanhoMinimo: 8,
  /** A partir deste tamanho (com os requisitos ok) a senha conta como forte. */
  tamanhoForte: 12,
  /** Quantos caracteres seguidos em sequência (abcd, 1234) ou repetidos (aaaa) já é proibido. */
  limiteSequencia: 4,
  /** Pedaços do e-mail/nome com menos letras que isso são ignorados (ex.: "jo"). */
  tamanhoMinimoPedacoPessoal: 4,
} as const;

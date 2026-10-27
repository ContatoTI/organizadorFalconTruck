/** Regras de login e senha (puras — usadas nas telas e no servidor). */

import { CONFIG_SENHA } from './configSenha';
import { SENHAS_COMUNS } from './senhasComuns';

/** Dados da pessoa que a senha não pode conter. */
export interface DadosPessoais {
  email?: string | null;
  nome?: string | null;
}

export type ForcaSenha = 'vazia' | 'fraca' | 'media' | 'forte';

export interface Requisito {
  id: 'tamanho' | 'maiusculaMinuscula' | 'numero' | 'comum' | 'sequencia' | 'pessoal';
  texto: string;
  ok: boolean;
}

export interface AvaliacaoSenha {
  forca: ForcaSenha;
  requisitos: Requisito[];
}

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "p@ssw0rd" → "password": desfaz as trocas óbvias de letra por número/símbolo. */
const TROCAS: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
const desfazerTrocas = (texto: string) => texto.replace(/[013457@$!]/g, c => TROCAS[c]);

function ehComum(senha: string): boolean {
  const minuscula = semAcento(senha);
  if (SENHAS_COMUNS.has(minuscula)) return true;
  // Tira números/símbolos das pontas e do meio: "Senha@2024" → "senha".
  const soLetras = minuscula.replace(/[^a-z]/g, '');
  if (soLetras.length === 0 || SENHAS_COMUNS.has(soLetras)) return true;
  return SENHAS_COMUNS.has(desfazerTrocas(minuscula).replace(/[^a-z]/g, ''));
}

/** Tem "abcd", "4321" ou "aaaa" (tamanho vem da config)? */
function temSequencia(senha: string): boolean {
  const limite = CONFIG_SENHA.limiteSequencia;
  const texto = senha.toLowerCase();
  let subindo = 1, descendo = 1, repetindo = 1;
  for (let i = 1; i < texto.length; i++) {
    const passo = texto.charCodeAt(i) - texto.charCodeAt(i - 1);
    subindo = passo === 1 ? subindo + 1 : 1;
    descendo = passo === -1 ? descendo + 1 : 1;
    repetindo = passo === 0 ? repetindo + 1 : 1;
    if (Math.max(subindo, descendo, repetindo) >= limite) return true;
  }
  return false;
}

/** Pedaços do e-mail e do nome (ex.: "joao.silva@empresa.com" → joao, silva, empresa). */
function pedacosPessoais({ email, nome }: DadosPessoais): string[] {
  const [usuario = '', dominio = ''] = semAcento(email ?? '').split('@');
  const pedacos = [
    ...usuario.split(/[^a-z]+/),
    dominio.split('.')[0] ?? '',
    ...semAcento(nome ?? '').split(/[^a-z]+/),
  ];
  return pedacos.filter(p => p.length >= CONFIG_SENHA.tamanhoMinimoPedacoPessoal);
}

/** Confere cada requisito e dá a força. Usada na barrinha das telas e na validação. */
export function avaliarSenha(senha: string, pessoal: DadosPessoais = {}): AvaliacaoSenha {
  const normalizada = semAcento(senha);
  const requisitos: Requisito[] = [
    { id: 'tamanho', texto: `Pelo menos ${CONFIG_SENHA.tamanhoMinimo} caracteres`, ok: senha.length >= CONFIG_SENHA.tamanhoMinimo },
    { id: 'maiusculaMinuscula', texto: 'Letras maiúsculas e minúsculas', ok: /\p{Lu}/u.test(senha) && /\p{Ll}/u.test(senha) },
    { id: 'numero', texto: 'Pelo menos um número', ok: /\d/.test(senha) },
    { id: 'comum', texto: 'Não ser uma senha comum (ex.: 123456, Senha@2024)', ok: senha.length > 0 && !ehComum(senha) },
    { id: 'sequencia', texto: 'Sem sequências ou repetições (abcd, 1234, aaaa)', ok: senha.length > 0 && !temSequencia(senha) },
    { id: 'pessoal', texto: 'Não conter seu nome ou e-mail', ok: !pedacosPessoais(pessoal).some(p => normalizada.includes(p)) },
  ];

  if (senha.length === 0) return { forca: 'vazia', requisitos };
  if (requisitos.some(r => !r.ok)) return { forca: 'fraca', requisitos };
  const temSimbolo = /[^\p{L}\d]/u.test(senha);
  return { forca: senha.length >= CONFIG_SENHA.tamanhoForte || temSimbolo ? 'forte' : 'media', requisitos };
}

/** Mensagem de erro da nova senha, ou null se estiver ok. */
export function validarNovaSenha(senha: string, confirmacao: string, pessoal: DadosPessoais = {}): string | null {
  if (senha !== confirmacao) return 'As senhas não coincidem';
  const faltando = avaliarSenha(senha, pessoal).requisitos.find(r => !r.ok);
  return faltando ? `Senha fraca: ${faltando.texto.charAt(0).toLowerCase()}${faltando.texto.slice(1)}` : null;
}

/**
 * Para onde mandar depois do link de e-mail. Só caminhos do próprio sistema:
 * "//site.com" ou "https://..." viram "/" (evita mandar o usuário para fora).
 */
export function destinoSeguro(proximo: string | null): string {
  if (!proximo) return '/';
  const caminho = proximo.startsWith('/') ? proximo : `/${proximo}`;
  return caminho.startsWith('//') || caminho.includes('://') ? '/' : caminho;
}

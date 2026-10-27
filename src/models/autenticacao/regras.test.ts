import { describe, it, expect } from 'vitest';
import { validarNovaSenha, destinoSeguro, avaliarSenha } from './regras';

const falhas = (senha: string, pessoal = {}) =>
  avaliarSenha(senha, pessoal).requisitos.filter(r => !r.ok).map(r => r.id);

describe('validarNovaSenha', () => {
  it('aceita senha forte e confirmada', () => {
    expect(validarNovaSenha('Ventania#Rua82', 'Ventania#Rua82')).toBeNull();
  });
  it('recusa senhas diferentes', () => {
    expect(validarNovaSenha('Ventania#Rua82', 'Ventania#Rua83')).toBe('As senhas não coincidem');
  });
  it('recusa senha fraca dizendo o que falta', () => {
    expect(validarNovaSenha('Ab1x', 'Ab1x')).toBe('Senha fraca: pelo menos 8 caracteres');
    expect(validarNovaSenha('123456', '123456')).toMatch(/^Senha fraca/);
  });
  it('recusa senha com o e-mail da pessoa', () => {
    expect(validarNovaSenha('Joaozinho82x', 'Joaozinho82x', { email: 'joaozinho@x.com' }))
      .toBe('Senha fraca: não conter seu nome ou e-mail');
  });
});

describe('avaliarSenha', () => {
  it('vazia não é fraca nem forte', () => {
    expect(avaliarSenha('').forca).toBe('vazia');
  });
  it('tamanho, maiúscula/minúscula e número', () => {
    expect(falhas('Ab1')).toContain('tamanho');
    expect(falhas('ventania82')).toContain('maiusculaMinuscula');
    expect(falhas('Ventaniaxx')).toContain('numero');
  });
  it('senhas comuns, inclusive com números/símbolos e trocas óbvias', () => {
    expect(falhas('12345678')).toContain('comum');
    expect(falhas('Senha@2024')).toContain('comum');
    expect(falhas('P@ssw0rd99')).toContain('comum');
    expect(falhas('Flamengo2024')).toContain('comum');
    expect(falhas('Ventania#Rua82')).not.toContain('comum');
  });
  it('sequências e repetições', () => {
    expect(falhas('Xabcd9Kw')).toContain('sequencia');
    expect(falhas('Kw9876xQ')).toContain('sequencia');
    expect(falhas('Kwaaaa9Q')).toContain('sequencia');
    expect(falhas('Kw12x9Qa')).not.toContain('sequencia');
  });
  it('nome e e-mail (sem acento, ignora pedaços curtos)', () => {
    expect(falhas('Silva#2024x', { nome: 'José Silva' })).toContain('pessoal');
    expect(falhas('Truckx#2024', { email: 'ana@falcontruck.com.br' })).not.toContain('pessoal');
    expect(falhas('Falcontruck#9x', { email: 'ana@falcontruck.com.br' })).toContain('pessoal');
    expect(falhas('Ana#Ventos82', { email: 'ana@x.com' })).not.toContain('pessoal');
  });
  it('média com o mínimo; forte se longa ou com símbolo', () => {
    expect(avaliarSenha('Ventania82').forca).toBe('media');
    expect(avaliarSenha('Ventania#82').forca).toBe('forte');
    expect(avaliarSenha('VentaniaNaRua82').forca).toBe('forte');
    expect(avaliarSenha('ventania').forca).toBe('fraca');
  });
});

describe('destinoSeguro', () => {
  it('mantém caminhos do sistema', () => {
    expect(destinoSeguro('/auth/reset-password')).toBe('/auth/reset-password');
    expect(destinoSeguro('todos')).toBe('/todos');
    expect(destinoSeguro(null)).toBe('/');
  });
  it('não deixa mandar para outro site', () => {
    expect(destinoSeguro('//site-ruim.com')).toBe('/');
    expect(destinoSeguro('https://site-ruim.com')).toBe('/');
  });
});

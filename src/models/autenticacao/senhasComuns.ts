/**
 * Senhas e palavras mais usadas (listas públicas de vazamentos + comuns no Brasil).
 * A senha é recusada se for uma delas, ou se, tirando números e símbolos,
 * sobrar só uma delas (ex.: "Senha@2024" → "senha").
 */
export const SENHAS_COMUNS: ReadonlySet<string> = new Set([
  // números e teclado
  '123456', '1234567', '12345678', '123456789', '1234567890', '12345678910', '01234567',
  '87654321', '987654321', '11111111', '00000000', '88888888', '12341234', '11223344',
  '123123123', '147258369', '159753', '159357', '102030', '10203040', '1020304050',
  'qwerty', 'qwertyui', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm',
  'qazwsx', 'qweasd', 'qweasdzxc', '1qaz2wsx', 'q1w2e3r4', 'q1w2e3r4t5', '1q2w3e4r',
  '1q2w3e4r5t', 'a1b2c3d4', 'abc123', 'abcd1234', 'abcdefgh', 'aa123456', 'qwe123',
  // palavras em inglês
  'password', 'passw0rd', 'p@ssw0rd', 'pass', 'admin', 'administrator', 'root', 'user',
  'login', 'welcome', 'letmein', 'master', 'secret', 'iloveyou', 'monkey', 'dragon',
  'sunshine', 'princess', 'football', 'baseball', 'superman', 'batman', 'starwars',
  'shadow', 'michael', 'jordan', 'hello', 'freedom', 'whatever', 'trustno', 'access',
  'charlie', 'donald', 'computer', 'internet', 'google', 'default', 'changeme', 'test',
  'guest', 'love', 'lovely', 'flower', 'summer', 'winter', 'killer', 'pokemon',
  'mustang', 'harley', 'ranger', 'buster', 'soccer', 'hockey', 'cookie', 'cheese',
  'pepper', 'ginger', 'hunter', 'tigger', 'jennifer', 'jessica', 'thomas', 'robert',
  'daniel', 'andrew', 'joshua', 'matrix', 'samsung', 'apple', 'microsoft', 'linkedin',
  'facebook', 'instagram', 'twitter', 'youtube', 'netflix', 'mypassword', 'nopassword',
  // palavras em português
  'senha', 'minhasenha', 'mudar', 'mudarsenha', 'trocar', 'trocarsenha', 'novasenha',
  'senhanova', 'teste', 'testando', 'usuario', 'acesso', 'entrar', 'bemvindo',
  'administrador', 'adm', 'sistema', 'empresa', 'brasil', 'saopaulo', 'flamengo',
  'corinthians', 'palmeiras', 'santos', 'gremio', 'vasco', 'cruzeiro', 'botafogo',
  'fluminense', 'internacional', 'amor', 'meuamor', 'teamo', 'amorzinho', 'familia',
  'deus', 'deusefiel', 'jesus', 'jesuscristo', 'gabriel', 'lucas', 'pedro', 'mateus',
  'maria', 'joao', 'jose', 'ana', 'juliana', 'fernanda', 'camila', 'amanda',
  'beatriz', 'carlos', 'felipe', 'rafael', 'bruno', 'rodrigo', 'marcelo', 'eduardo',
  'gustavo', 'leonardo', 'vitoria', 'mudar123', 'senha123', 'abc', 'abcd', 'abcdef',
  'futebol', 'cachorro', 'gatinho', 'princesa', 'estrela', 'chocolate', 'morango',
  'banana', 'abacaxi', 'trabalho', 'escritorio', 'financeiro', 'comercial', 'vendas',
  'suporte', 'contato', 'caminhao', 'oficina', 'segredo', 'liberdade', 'felicidade',
]);

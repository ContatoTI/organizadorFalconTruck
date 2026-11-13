// Configuração dos anexos de tarefa (SSOT: usada no front e no back).

const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
const TIPOS_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export const CONFIG_ANEXOS = {
  tiposImagem: TIPOS_IMAGEM,
  tiposVideo: TIPOS_VIDEO,
  tiposAceitos: [...TIPOS_IMAGEM, ...TIPOS_VIDEO],
  tamanhoMaxMbImagem: 10,
  tamanhoMaxMbVideo: 50,
  pastaTarefas: 'Tarefas',
} as const;

export function ehVideo(mime: string): boolean {
  return (CONFIG_ANEXOS.tiposVideo as readonly string[]).includes(mime);
}

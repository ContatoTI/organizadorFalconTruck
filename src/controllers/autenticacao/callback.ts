import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/src/lib/supabase/Server';
import { destinoSeguro } from '@/src/models/autenticacao/regras';

/**
 * Ponto de pouso dos links de e-mail (redefinição de senha, link mágico,
 * confirmação de conta).
 *
 * O Supabase manda o usuário para cá com um `code` (ou `token_hash` + `type`).
 * Trocamos isso pela sessão AQUI, no servidor, e só então mandamos para a tela
 * final (`next`). Assim a página de destino já abre com a sessão pronta, sem
 * corrida com o middleware nem depender do link ser aberto no mesmo aparelho.
 */
export async function pousoDoLink(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }

  if (ok) return NextResponse.redirect(`${origin}${destinoSeguro(searchParams.get('next'))}`);
  return NextResponse.redirect(`${origin}/login?error=link-invalido`);
}

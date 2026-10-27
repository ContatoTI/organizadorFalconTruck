'use client';

import { useState, useEffect } from 'react';
import { clienteAuth } from './clienteAuth';
import { validarNovaSenha, type DadosPessoais } from '@/src/models/autenticacao/regras';
import { ForcaSenha } from './ForcaSenha';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export function PaginaRedefinirSenha() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);
  const [pessoal, setPessoal] = useState<DadosPessoais>({});
  const router = useRouter();

  useEffect(() => {
    // A troca do código pela sessão já aconteceu em /auth/callback (no
    // servidor), então normalmente chegamos aqui com a sessão pronta. O
    // listener cobre o caso do link implícito (token no #hash), tratado
    // pelo detectSessionInUrl do client.
    const pronto = (session: { user?: { email?: string; user_metadata?: { full_name?: string } } } | null) => {
      if (!session) return;
      setReady(true);
      setPessoal({ email: session.user?.email, nome: session.user?.user_metadata?.full_name });
    };
    const pararDeOuvir = clienteAuth.aoMudarSessao(pronto);
    clienteAuth.sessaoAtual().then(pronto);

    // Sem sessão depois de alguns segundos = link expirado ou já usado.
    const timer = setTimeout(() => {
      setReady(current => {
        if (!current) setErrorMsg('Link inválido ou expirado. Solicite um novo link de redefinição.');
        return current;
      });
    }, 5000);

    return () => {
      pararDeOuvir();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async () => {
    setErrorMsg('');

    const erroSenha = validarNovaSenha(password, confirmPassword, pessoal);
    if (erroSenha) {
      setErrorMsg(erroSenha);
      return;
    }

    setLoading(true);
    try {
      await clienteAuth.trocarSenha(password);
      setDone(true);
      setTimeout(() => router.push('/'), 1500);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-accent/20">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight">Nova Senha</CardTitle>
            <CardDescription>
              {errorMsg && !ready
                ? 'Não foi possível confirmar o link'
                : ready
                ? 'Escolha sua nova senha'
                : 'Confirmando o link de redefinição...'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!ready && !errorMsg && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {ready && !done && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  <ForcaSenha senha={password} pessoal={pessoal} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {done && (
              <div className="p-3 rounded-lg bg-green-500/10 text-green-600 text-sm font-medium text-center animate-in fade-in zoom-in-95 duration-200">
                Senha atualizada! Entrando...
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium animate-in fade-in zoom-in-95 duration-200">
                {errorMsg}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            {ready && !done && (
              <Button type="submit" className="w-full h-11" disabled={loading || !password || !confirmPassword}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Nova Senha'}
              </Button>
            )}

            {errorMsg && !ready && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground hover:text-primary"
                onClick={() => router.push('/login')}
              >
                Voltar para login
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

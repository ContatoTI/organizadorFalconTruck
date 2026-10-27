'use client';

import { useState, useEffect } from 'react';
import { clienteAuth } from './clienteAuth';
import { validarNovaSenha } from '@/src/models/autenticacao/regras';
import { ForcaSenha } from './ForcaSenha';
import { useRouter } from 'next/navigation';
import { LogIn, Mail, Lock, UserPlus, Loader2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export function PaginaLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [message, setMessage] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const user = await clienteAuth.usuarioAtual();
      if (user) {
        router.push('/');
      }
    };
    checkUser();

    return clienteAuth.aoMudarSessao((session) => {
      if (session?.user) {
        router.push('/');
      }
    });
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg('');
    setMessage('');

    try {
      await clienteAuth.entrarComSenha(email, password);
      router.push('/');
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    setLoading(true);
    setErrorMsg('');
    setMessage('');

    try {
      await clienteAuth.enviarLinkDeLogin(email);
      setMessage('Link de login enviado para seu email!');
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setLoading(true);
    setErrorMsg('');
    setMessage('');

    try {
      await clienteAuth.enviarRedefinicaoDeSenha(email);
      setMessage('Enviamos um link para redefinir sua senha. Confira seu email.');
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    setErrorMsg('');
    setMessage('');

    const erroSenha = validarNovaSenha(password, confirmPassword, { email });
    if (erroSenha) {
      setErrorMsg(erroSenha);
      setLoading(false);
      return;
    }

    try {
      await clienteAuth.cadastrar(email, password);
      setMessage('Conta criada! Verifique seu email para confirmar.');
      setIsSignUp(false);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setIsForgot(false);
    setErrorMsg('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const toggleForgot = (value: boolean) => {
    setIsForgot(value);
    setErrorMsg('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-accent/20">
        <form onSubmit={(e) => {
          e.preventDefault();
          if (isForgot) {
            handleForgotPassword();
          } else if (isSignUp) {
            handleSignUp();
          } else {
            handleLogin();
          }
        }}>
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight">
              {isForgot ? 'Redefinir Senha' : isSignUp ? 'Criar Conta' : 'Entrar'}
            </CardTitle>
            <CardDescription>
              {isForgot
                ? 'Informe seu email para receber o link de redefinição'
                : isSignUp
                ? 'Crie sua conta para gerenciar tarefas'
                : 'Acesse sua conta para ver suas tarefas'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {!isForgot && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                {isSignUp && <ForcaSenha senha={password} pessoal={{ email }} />}
              </div>
            )}

            {!isForgot && isSignUp && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <Label htmlFor="confirm-password">Confirmar Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium animate-in fade-in zoom-in-95 duration-200">
                {errorMsg}
              </div>
            )}

            {message && (
              <div className="p-3 rounded-lg bg-green-500/10 text-green-600 text-sm font-medium animate-in fade-in zoom-in-95 duration-200">
                {message}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            {isForgot ? (
              <Button
                type="submit"
                className="w-full h-11"
                disabled={loading || !email}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                Enviar Link de Redefinição
              </Button>
            ) : isSignUp ? (
              <Button
                type="submit"
                className="w-full h-11"
                disabled={loading || !email || !password || !confirmPassword}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Criar Conta
              </Button>
            ) : (
              <>
                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                  Entrar com Email
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  onClick={handleMagicLink}
                  disabled={loading || !email}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Enviar Link Mágico
                </Button>
              </>
            )}

            {isForgot ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground hover:text-primary"
                onClick={() => toggleForgot(false)}
              >
                Voltar para login
              </Button>
            ) : (
              <>
                {!isSignUp && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-primary text-sm h-8"
                    onClick={() => toggleForgot(true)}
                  >
                    Esqueceu a senha?
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-primary"
                  onClick={toggleMode}
                >
                  {isSignUp ? 'Já tem conta? Entrar' : 'Não tem conta? Criar'}
                </Button>
              </>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

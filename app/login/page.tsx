'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { LogIn, Mail, Lock, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [message, setMessage] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();
  const client = createClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        router.push('/');
      }
    };
    checkUser();

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        router.push('/');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg('');
    setMessage('');

    try {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
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
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_APP_URL,
        },
      });

      if (error) throw error;
      setMessage('Link de login enviado para seu email!');
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

    if (password !== confirmPassword) {
      setErrorMsg('As senhas não coincidem');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setErrorMsg('A senha deve ter pelo menos 6 caracteres');
      setLoading(false);
      return;
    }

    try {
      const { error } = await client.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
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
    setErrorMsg('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-accent/20">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-3xl font-bold tracking-tight">
            {isSignUp ? 'Criar Conta' : 'Entrar'}
          </CardTitle>
          <CardDescription>
            {isSignUp ? 'Crie sua conta para gerenciar tarefas' : 'Acesse sua conta para ver suas tarefas'}
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

          <div className="space-y-2">
            <Label htmlFor="password">
              {isSignUp ? 'Senha' : 'Senha (Opcional se usar Magic Link)'}
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                required={isSignUp}
              />
            </div>
          </div>

          {isSignUp && (
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
          {isSignUp ? (
            <Button
              className="w-full h-11"
              onClick={handleSignUp}
              disabled={loading || !email || !password || !confirmPassword}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Criar Conta
            </Button>
          ) : (
            <>
              <Button
                className="w-full h-11"
                onClick={handleLogin}
                disabled={loading || !email || !password}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                Entrar com Email
              </Button>

              <Button
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

          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-primary"
            onClick={toggleMode}
          >
            {isSignUp ? 'Já tem conta? Entrar' : 'Não tem conta? Criar'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

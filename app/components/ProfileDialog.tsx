'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/app/lib/supabase/Client';
import { cn } from '@/lib/utils';
import { CheckCircle, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
}

export function ProfileDialog({ open, onOpenChange, user }: ProfileDialogProps) {
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const client = createClient();

  useEffect(() => {
    if (open && user) {
      setName(user.user_metadata?.full_name || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(null);
    }
  }, [open, user]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    if (newPassword && newPassword.length < 6) {
      setMessage({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' });
      setSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'As senhas não coincidem.' });
      setSaving(false);
      return;
    }

    if (newPassword && !currentPassword) {
      setMessage({ type: 'error', text: 'Informe sua senha atual para definir uma nova senha.' });
      setSaving(false);
      return;
    }

    const updates: Promise<any>[] = [];

    if (name !== (user.user_metadata?.full_name || '')) {
      updates.push(client.auth.updateUser({ data: { full_name: name } }));
    }

    if (newPassword) {
      // Valida a senha atual antes de permitir a alteracao
      const { error: signInError } = await client.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setMessage({ type: 'error', text: 'Senha atual incorreta.' });
        setSaving(false);
        return;
      }

      updates.push(client.auth.updateUser({ password: newPassword }));
    }

    if (updates.length === 0) {
      setMessage({ type: 'error', text: 'Nenhuma alteracao para salvar.' });
      setSaving(false);
      return;
    }

    try {
      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error).map(r => r.error?.message);

      if (errors.length > 0) {
        setMessage({ type: 'error', text: errors.join('\n') });
      } else {
        setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => onOpenChange(false), 1200);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Erro ao salvar alteracoes.' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setSendingReset(true);
    setMessage(null);

    try {
      const { error } = await client.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Email de redefinicao enviado! Verifique sua caixa de entrada.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Erro ao enviar email de redefinicao.' });
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {message && (
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                message.type === 'success'
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-destructive/10 text-destructive'
              )}
            >
              {message.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={user?.email || ''}
              disabled
              className="opacity-60"
            />
          </div>

          <div>
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>

          <hr className="border-border" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="current-password">Senha atual</Label>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={sendingReset}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                {sendingReset ? 'Enviando...' : 'Nao lembro minha senha'}
              </button>
            </div>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Sua senha atual"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="new-password">Nova senha</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha (min. 6 caracteres)"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Deixe a senha em branco para mante-la inalterada.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

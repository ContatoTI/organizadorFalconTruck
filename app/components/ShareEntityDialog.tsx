'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search, Star, User as UserIcon } from 'lucide-react';
import { createClient } from '@/app/lib/supabase/Client';
import { shareAPI } from '@/app/lib/shareAPI';
import { cn } from '@/app/lib/utils';
import type { User as AppUser } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ShareEntityDialogProps {
  open: boolean;
  onClose: () => void;
  entityType: 'section' | 'task';
  entityId: number;
  currentUserId: string;
  /** Só faz sentido para pastas: usuário que recebe automaticamente as tarefas criadas nela */
  defaultAssigneeId?: string | null;
  onDefaultAssigneeChange?: (userId: string | null) => void;
}

export function ShareEntityDialog({
  open,
  onClose,
  entityType,
  entityId,
  currentUserId,
  defaultAssigneeId = null,
  onDefaultAssigneeChange,
}: ShareEntityDialogProps) {
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);
      const client = createClient();
      const [{ data: usersData }, shares] = await Promise.all([
        client.from('profiles').select('id, email, full_name, avatar_url').neq('id', currentUserId).limit(50),
        entityType === 'section' ? shareAPI.getSectionShares(entityId) : shareAPI.getTaskShares(entityId),
      ]);

      if (usersData) setAllUsers(usersData as AppUser[]);
      setSharedUserIds(shares.map(s => s.user_id));
      setLoading(false);
    };

    load();
  }, [open, entityType, entityId, currentUserId]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return allUsers;
    const term = search.toLowerCase();
    return allUsers.filter(
      u => u.full_name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)
    );
  }, [allUsers, search]);

  const toggleShare = async (userId: string) => {
    const isShared = sharedUserIds.includes(userId);

    if (isShared) {
      setSharedUserIds(prev => prev.filter(id => id !== userId));
      if (entityType === 'section') {
        await shareAPI.unshareSection(entityId, userId);
        if (defaultAssigneeId === userId) onDefaultAssigneeChange?.(null);
      } else {
        await shareAPI.unshareTask(entityId, userId);
      }
    } else {
      setSharedUserIds(prev => [...prev, userId]);
      if (entityType === 'section') {
        await shareAPI.shareSection(entityId, userId);
      } else {
        await shareAPI.shareTask(entityId, userId);
      }
    }
  };

  const toggleDefaultAssignee = async (userId: string) => {
    if (!onDefaultAssigneeChange) return;
    const next = defaultAssigneeId === userId ? null : userId;
    onDefaultAssigneeChange(next);
    await shareAPI.setSectionDefaultAssignee(entityId, next);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{entityType === 'section' ? 'Compartilhar pasta' : 'Compartilhar tarefa'}</DialogTitle>
        </DialogHeader>

        {entityType === 'section' && (
          <p className="text-xs text-muted-foreground -mt-2 mb-2">
            Quem tiver acesso vê apenas as tarefas desta pasta. Marque a estrela para que novas
            tarefas criadas aqui já sejam direcionadas automaticamente a essa pessoa.
          </p>
        )}

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuário..."
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {loading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Nenhum usuário encontrado</div>
          ) : (
            filteredUsers.map((u) => {
              const isShared = sharedUserIds.includes(u.id);
              const isDefaultAssignee = entityType === 'section' && defaultAssigneeId === u.id;
              return (
                <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none">{u.full_name || u.email}</p>
                      <p className="text-xs text-muted-foreground mt-1">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {entityType === 'section' && isShared && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Tornar dono automático da pasta"
                        onClick={() => toggleDefaultAssignee(u.id)}
                        className={cn('h-8 w-8', isDefaultAssignee ? 'text-yellow-500' : 'text-muted-foreground/50')}
                      >
                        <Star className={cn('w-4 h-4', isDefaultAssignee && 'fill-yellow-500')} />
                      </Button>
                    )}
                    <Button
                      variant={isShared ? 'secondary' : 'default'}
                      size="sm"
                      onClick={() => toggleShare(u.id)}
                      className={cn('rounded-full h-8', isShared && 'bg-green-100 text-green-700 hover:bg-green-200')}
                    >
                      {isShared ? (
                        <><Check className="w-3 h-3 mr-1" /> Compartilhado</>
                      ) : (
                        <><Plus className="w-3 h-3 mr-1" /> Compartilhar</>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

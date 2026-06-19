'use client';

import { X, Search, Plus, Check, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { cn } from '@/app/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ShareModalProps {
  isOpen: boolean;
  projectId: number;
  projectOwnerId: string;
  currentUserId: string;
  projectMembers: { userId: string; memberId: number }[];
  onClose: () => void;
  onToggleShare: (targetUserId: string) => void;
}

interface User {
  id: string;
  full_name: string;
  email: string;
}

export function ShareModal({
  isOpen,
  projectId,
  projectOwnerId,
  currentUserId,
  projectMembers,
  onClose,
  onToggleShare,
}: ShareModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchUsers = async () => {
      setLoading(true);
      const client = createClient();
      const { data } = await client
        .from('profiles')
        .select('id, full_name, email')
        .neq('id', currentUserId);
      setUsers(data || []);
      setLoading(false);
    };

    fetchUsers();
  }, [isOpen, currentUserId]);

  const filteredUsers = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const isOwner = projectOwnerId === currentUserId;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Compartilhar projeto</DialogTitle>
          {!isOwner && (
            <DialogDescription>
              Apenas o dono pode compartilhar este projeto.
            </DialogDescription>
          )}
        </DialogHeader>

        {isOwner && (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuários..."
                className="pl-9"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 max-h-[50vh]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  Nenhum usuário encontrado
                </p>
              ) : (
                filteredUsers.map((u) => {
                  const isShared = projectMembers.some((m) => m.userId === u.id);
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {u.full_name || u.email}
                        </p>
                        {u.full_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {u.email}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={isShared ? "secondary" : "default"}
                        onClick={() => onToggleShare(u.id)}
                        className={cn(
                          'flex items-center gap-1 h-8 rounded-full',
                          isShared && 'bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800'
                        )}
                      >
                        {isShared ? (
                          <>
                            <Check className="w-3 h-3" />
                            Membro
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            Convidar
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

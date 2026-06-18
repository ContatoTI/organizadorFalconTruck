'use client';

import { X, Search, Plus, Check, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { cn } from '@/app/lib/utils';

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

  if (!isOpen) return null;

  const filteredUsers = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const isOwner = projectOwnerId === currentUserId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl p-6 w-96 shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Compartilhar projeto</h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isOwner && (
          <p className="text-sm text-muted-foreground mb-3">
            Apenas o dono pode compartilhar este projeto.
          </p>
        )}

        {isOwner && (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuários..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
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
                      <button
                        onClick={() => onToggleShare(u.id)}
                        className={cn(
                          'flex items-center gap-1 px-3 py-1 rounded-full text-xs transition-colors flex-shrink-0',
                          isShared
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-primary/10 text-primary hover:bg-primary/20'
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
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

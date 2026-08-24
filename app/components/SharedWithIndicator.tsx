'use client';

import { useState, useEffect, useRef } from 'react';
import { User as UserIcon, Star } from 'lucide-react';
import { createClient } from '@/app/lib/supabase/Client';
import { cn, getColorFromString, getInitials } from '@/app/lib/utils';

type Profile = { id: string; full_name: string | null; email: string | null; avatar_url?: string | null };

const MAX_VISIBLE_AVATARS = 3;

function Avatar({ profile, size = 20, ringClassName = 'ring-sidebar', isDefault = false }: { profile: Profile; size?: number; ringClassName?: string; isDefault?: boolean }) {
  const name = profile.full_name || profile.email || '?';
  const color = getColorFromString(name);
  const initials = getInitials(name);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} title={isDefault ? `${name} (responsável padrão da pasta)` : name}>
      <div
        className={cn('rounded-full flex items-center justify-center font-semibold text-white ring-2 shadow-sm overflow-hidden w-full h-full', ringClassName)}
        style={{ backgroundColor: color, fontSize: size * 0.4 }}
      >
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {isDefault && (
        <Star className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 text-yellow-400 fill-yellow-400 drop-shadow" />
      )}
    </div>
  );
}

function AvatarStack({
  profiles,
  open,
  setOpen,
  ref,
  size = 20,
  label = 'Compartilhado com',
  onAvatarClick,
  defaultAssigneeId = null,
}: {
  profiles: Profile[];
  open: boolean;
  setOpen: (v: boolean) => void;
  ref: React.RefObject<HTMLDivElement | null>;
  size?: number;
  label?: string;
  onAvatarClick?: () => void;
  defaultAssigneeId?: string | null;
}) {
  const visible = profiles.slice(0, MAX_VISIBLE_AVATARS);
  const extra = profiles.length - visible.length;

  return (
    <div ref={ref} className="relative inline-flex flex-shrink-0">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAvatarClick ? onAvatarClick() : setOpen(!open); }}
        className="flex items-center -space-x-2 hover:brightness-95 transition-[filter] rounded-full"
        title={onAvatarClick ? 'Escolher responsável padrão da pasta' : 'Ver quem tem acesso'}
      >
        {visible.map((p) => (
          <Avatar key={p.id} profile={p} size={size} isDefault={p.id === defaultAssigneeId} />
        ))}
        {extra > 0 && (
          <div
            className="rounded-full flex items-center justify-center font-semibold bg-muted text-muted-foreground ring-2 ring-sidebar shadow-sm flex-shrink-0"
            style={{ width: size, height: size, fontSize: size * 0.38 }}
          >
            +{extra}
          </div>
        )}
      </button>
      {open && !onAvatarClick && (
        <div className="absolute top-full mt-2 right-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 whitespace-nowrap">
          <div className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            {label}
          </div>
          <div className="space-y-2">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <Avatar profile={p} size={24} ringClassName="ring-popover" isDefault={p.id === defaultAssigneeId} />
                <span className="truncate max-w-[180px]">{p.full_name || p.email}</span>
                {p.id === defaultAssigneeId && (
                  <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium">Padrão</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function useOutsideClick(ref: React.RefObject<HTMLDivElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, ref, onClose]);
}

export function SectionSharedIndicator({ sectionId, defaultAssigneeId = null, onOpenShare }: { sectionId: number; defaultAssigneeId?: string | null; onOpenShare?: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const client = createClient();
      const { data: shares } = await client
        .from('section_shares')
        .select('user_id')
        .eq('section_id', sectionId);
      if (cancelled) return;
      if (!shares || shares.length === 0) {
        setLoading(false);
        return;
      }
      const userIds = shares.map(s => s.user_id);
      const { data: profiles } = await client
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);
      if (!cancelled) {
        setProfiles((profiles || []) as Profile[]);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [sectionId]);

  useOutsideClick(ref, open, () => setOpen(false));

  if (loading) return null;

  // Sem ninguém compartilhado ainda: mostra uma bolinha neutra clicável, para
  // que dar o primeiro responsável padrão não dependa de já ter compartilhado a pasta.
  if (profiles.length === 0) {
    if (!onOpenShare) return null;
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenShare(); }}
        className="w-5 h-5 rounded-full flex items-center justify-center bg-muted text-muted-foreground/60 hover:text-primary hover:bg-accent transition-colors flex-shrink-0"
        title="Escolher responsável padrão da pasta"
      >
        <UserIcon className="w-3 h-3" />
      </button>
    );
  }

  return (
    <AvatarStack
      profiles={profiles}
      open={open}
      setOpen={setOpen}
      ref={ref}
      size={20}
      label="Compartilhado com"
      onAvatarClick={onOpenShare}
      defaultAssigneeId={defaultAssigneeId}
    />
  );
}

export function ProjectSharedIndicator({ projectId }: { projectId: number }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const client = createClient();
      const { data: members } = await client
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId);
      if (cancelled) return;
      if (!members || members.length === 0) {
        setLoading(false);
        return;
      }
      const userIds = members.map(m => m.user_id);
      const { data: profiles } = await client
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);
      if (!cancelled) {
        setProfiles((profiles || []) as Profile[]);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  useOutsideClick(ref, open, () => setOpen(false));

  if (loading || profiles.length === 0) return null;

  return (
    <div className="ml-1.5">
      <AvatarStack profiles={profiles} open={open} setOpen={setOpen} ref={ref} size={18} label="Membros" />
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { cn, getColorFromString, getInitials } from '@/app/lib/utils';

type Profile = { id: string; full_name: string | null; email: string | null; avatar_url?: string | null };

const MAX_VISIBLE_AVATARS = 3;

function Avatar({ profile, size = 20, ringClassName = 'ring-sidebar' }: { profile: Profile; size?: number; ringClassName?: string }) {
  const name = profile.full_name || profile.email || '?';
  const color = getColorFromString(name);
  const initials = getInitials(name);

  return (
    <div
      className={cn('rounded-full flex items-center justify-center font-semibold text-white ring-2 shadow-sm overflow-hidden flex-shrink-0', ringClassName)}
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.4 }}
    >
      {profile.avatar_url ? (
        <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
      ) : (
        initials
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
}: {
  profiles: Profile[];
  open: boolean;
  setOpen: (v: boolean) => void;
  ref: React.RefObject<HTMLDivElement | null>;
  size?: number;
  label?: string;
}) {
  const visible = profiles.slice(0, MAX_VISIBLE_AVATARS);
  const extra = profiles.length - visible.length;

  return (
    <div ref={ref} className="relative inline-flex flex-shrink-0">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className="flex items-center -space-x-2 hover:brightness-95 transition-[filter] rounded-full"
        title="Ver quem tem acesso"
      >
        {visible.map((p) => (
          <Avatar key={p.id} profile={p} size={size} />
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
      {open && (
        <div className="absolute top-full mt-2 right-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 whitespace-nowrap">
          <div className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            {label}
          </div>
          <div className="space-y-2">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <Avatar profile={p} size={24} ringClassName="ring-popover" />
                <span className="truncate max-w-[180px]">{p.full_name || p.email}</span>
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

export function SectionSharedIndicator({ sectionId }: { sectionId: number }) {
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

  if (loading || profiles.length === 0) return null;

  return <AvatarStack profiles={profiles} open={open} setOpen={setOpen} ref={ref} size={20} label="Compartilhado com" />;
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

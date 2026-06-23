'use client';

import { Bell, Folder, X, Check } from 'lucide-react';

interface PendingInvite {
  id: number;
  project_id: number;
  project_title: string;
  project_color: string;
  inviter_name: string;
  inviter_email: string;
}

interface DeclineNotification {
  id: number;
  project_id: number;
  project_title: string;
  project_color: string;
  declined_user_name: string;
  invited_user_id: string;
}

interface NotificationsPanelProps {
  isOpen: boolean;
  pendingInvites: PendingInvite[];
  declineNotifications: DeclineNotification[];
  onAcceptInvite: (inviteId: number, projectId: number) => void;
  onDeclineInvite: (inviteId: number) => void;
  onReinviteUser: (projectId: number, userId: string) => void;
  onDismissDecline: (inviteId: number) => void;
  onClose: () => void;
}

export function NotificationsPanel({
  isOpen,
  pendingInvites,
  declineNotifications,
  onAcceptInvite,
  onDeclineInvite,
  onReinviteUser,
  onDismissDecline,
  onClose,
}: NotificationsPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute right-0 mt-2 w-80 bg-card rounded-xl border border-border shadow-modal max-h-96 overflow-y-auto">
      <div className="p-3 border-b">
        <h3 className="font-semibold">Notificações</h3>
      </div>

      {pendingInvites.length === 0 && declineNotifications.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma notificação
        </div>
      ) : (
        <div className="divide-y">
          {pendingInvites.map((invite) => (
            <div key={`invite-${invite.id}`} className="p-3">
              <div className="flex items-start gap-3 mb-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: invite.project_color }}
                >
                  <Folder className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    Convite para {invite.project_title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Por {invite.inviter_name}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onAcceptInvite(invite.id, invite.project_id)}
                  className="flex-1 py-1.5 rounded-md bg-green-500 text-white hover:bg-green-600 text-xs font-medium"
                >
                  Aceitar
                </button>
                <button
                  onClick={() => onDeclineInvite(invite.id)}
                  className="flex-1 py-1.5 rounded-md border hover:bg-accent text-xs"
                >
                  Recusar
                </button>
              </div>
            </div>
          ))}

          {declineNotifications.map((notif) => (
            <div key={`declined-${notif.id}`} className="p-3">
              <div className="flex items-start gap-3 mb-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: notif.project_color }}
                >
                  <Folder className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {notif.declined_user_name} recusou o convite
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Projeto: {notif.project_title}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onReinviteUser(notif.project_id, notif.invited_user_id)}
                  className="flex-1 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
                >
                  Convidar novamente
                </button>
                <button
                  onClick={() => onDismissDecline(notif.id)}
                  className="px-3 py-1.5 rounded-md border hover:bg-accent text-xs"
                >
                  Dispensar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationBell({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-full bg-card border border-border hover:bg-accent transition-colors shadow-card"
    >
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
          {count}
        </span>
      )}
    </button>
  );
}

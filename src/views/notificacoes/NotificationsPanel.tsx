'use client';

import { Bell, Folder, X, Check, ClipboardList, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';

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

interface TaskReviewNotification {
  id: number;
  task_id: number;
  task_title: string;
  sender_name: string;
  type: string;
  note: string | null;
}

interface NotificationsPanelProps {
  isOpen: boolean;
  pendingInvites: PendingInvite[];
  declineNotifications: DeclineNotification[];
  taskReviewNotifications: TaskReviewNotification[];
  onAcceptInvite: (inviteId: number, projectId: number) => void;
  onDeclineInvite: (inviteId: number) => void;
  onReinviteUser: (projectId: number, userId: string) => void;
  onDismissDecline: (inviteId: number) => void;
  onDismissTaskReview: (id: number) => void;
  onApproveTaskReview: (notifId: number, taskId: number) => void;
  onRejectTaskReview: (notifId: number, taskId: number) => void;
  onClose: () => void;
}

export function NotificationsPanel({
  isOpen,
  pendingInvites,
  declineNotifications,
  taskReviewNotifications,
  onAcceptInvite,
  onDeclineInvite,
  onReinviteUser,
  onDismissDecline,
  onDismissTaskReview,
  onApproveTaskReview,
  onRejectTaskReview,
  onClose,
}: NotificationsPanelProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const total = pendingInvites.length + declineNotifications.length + taskReviewNotifications.length;

  return (
    <div className="absolute right-0 mt-2 w-80 bg-card rounded-xl border border-border shadow-modal max-h-96 overflow-y-auto">
      <div className="p-3 border-b">
        <h3 className="font-semibold">Notificações</h3>
      </div>

      {total === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma notificação
        </div>
      ) : (
        <div className="divide-y">
          {taskReviewNotifications.map((notif) => {
            const isApproved = notif.type === 'approved';
            const isRejected = notif.type === 'rejected';
            const isAssigned = notif.type === 'assigned';
            const isReview = notif.type === 'review';
            const iconBg = isApproved ? 'bg-green-100' : isRejected ? 'bg-red-100' : isAssigned ? 'bg-blue-100' : 'bg-yellow-100';
            const iconColor = isApproved ? 'text-green-600' : isRejected ? 'text-red-600' : isAssigned ? 'text-blue-600' : 'text-yellow-600';
            const title = isApproved ? 'Tarefa aprovada' : isRejected ? 'Tarefa reprovada' : isAssigned ? 'Nova tarefa atribuída a você' : 'Tarefa enviada para revisão';
            return (
            <div key={`review-${notif.id}`} className="p-3">
              <div className="flex items-start gap-3 mb-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                  {isAssigned ? (
                    <UserPlus className={`w-4 h-4 ${iconColor}`} />
                  ) : (
                    <ClipboardList className={`w-4 h-4 ${iconColor}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{title}</p>
                  <p className="text-xs text-muted-foreground truncate">{notif.task_title}</p>
                  {isRejected && notif.note && (
                    <p className="text-xs text-red-500 mt-0.5 italic">{notif.note}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Por {notif.sender_name}</p>
                </div>
              </div>
              {isReview && (
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => onApproveTaskReview(notif.id, notif.task_id)}
                    className="flex-1 py-1.5 rounded-md bg-green-500 text-white hover:bg-green-600 text-xs font-medium"
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => onRejectTaskReview(notif.id, notif.task_id)}
                    className="flex-1 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-600 text-xs font-medium"
                  >
                    Reprovar
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    router.push('/');
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('open-task-detail', { detail: { taskId: notif.task_id } }));
                    }, 100);
                    onClose();
                  }}
                  className="flex-1 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
                >
                  Ver tarefa
                </button>
                <button
                  onClick={() => onDismissTaskReview(notif.id)}
                  className="px-3 py-1.5 rounded-md border hover:bg-accent text-xs"
                >
                  Dispensar
                </button>
              </div>
            </div>
          )})}

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

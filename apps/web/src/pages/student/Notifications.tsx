import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { api } from '../../lib/api';
import { notificationSocket } from '../../lib/socket';

type Notification = {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string | null;
};
const formatNotificationTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(value));
export default function Notifications() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const {
    data: items = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['notifications', 'student'],
    queryFn: async () =>
      (await api.get<Notification[]>('/students/me/notifications')).data,
    refetchInterval: 5_000,
  });
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(null), 3000);
  };
  const markRead = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/students/me/notifications/${id}/read`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['notifications', 'student'] });
      notify('Notification marked as read.');
    },
    onError: () => notify('Could not mark the notification as read.', true),
  });
  useEffect(() => {
    const refresh = () =>
      client.invalidateQueries({ queryKey: ['notifications', 'student'] });
    notificationSocket.on('notification:new', refresh);
    return () => {
      notificationSocket.off('notification:new', refresh);
    };
  }, [client]);
  return (
    <DashboardLayout
      role="student"
      pageTitle="Notifications"
      userName="Jefferson Palceso"
      userTag="Student"
    >
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 z-50 rounded px-4 py-3 text-sm text-white ${
            toast.error ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.message}
        </div>
      )}
      <Card padded={false}>
        {isLoading && (
          <div className="p-5 text-sm text-text-2">Loading notifications…</div>
        )}
        {isError && (
          <div className="p-5 text-sm text-risk-high">
            Could not load notifications.
          </div>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <div className="p-5 text-sm text-text-2">
            You have no notifications.
          </div>
        )}
        {items.map((n, i) => {
          const Icon = n.type.includes('WARN')
            ? AlertTriangle
            : n.type.includes('CLEAR')
              ? CheckCircle2
              : Bell;
          const color = n.type.includes('WARN')
            ? 'var(--risk-med)'
            : n.type.includes('CLEAR')
              ? 'var(--risk-low)'
              : 'var(--brand)';
          return (
            <div
              key={n.id}
              className="flex items-start gap-3 px-5 py-4"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
            >
              <Icon
                size={17}
                style={{ color, marginTop: 2 }}
                className="flex-shrink-0"
              />
              <div className="flex-1">
                <button
                  disabled={markRead.isPending && markRead.variables === n.id}
                  onClick={() => {
                    if (!n.isRead) markRead.mutate(n.id);
                    if (n.link) navigate(n.link);
                  }}
                  className={`text-left font-body text-[13px] text-text-1 ${
                    n.isRead ? '' : 'font-semibold'
                  }`}
                >
                  {markRead.isPending && markRead.variables === n.id
                    ? 'Marking as read…'
                    : n.message}
                </button>
                <div className="font-body text-[11px] text-text-3 mt-1">
                  {formatNotificationTime(n.createdAt)}
                  {!n.isRead && ' · Select to mark as read'}
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </DashboardLayout>
  );
}

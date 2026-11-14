import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Check,
  LogOut,
  Menu,
  Moon,
  MoreVertical,
  Sun,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useTheme } from '../../lib/useTheme';
import type { Role } from '../../types/dashboard';
import { notificationSocket } from '../../lib/socket';
import { useAuthStore } from '../../store/authStore';

type TopbarProps = {
  role: Role;
  pageTitle: string;
  userName: string;
  userTag: string;
  profilePicture?: string | null;
  /** Drawer state for phones/tablets (hamburger button). */
  menuOpen?: boolean;
  onMenuToggle?: () => void;
};
type Notification = {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string | null;
};
const notificationEndpoint = (role: Role) =>
  role === 'student'
    ? '/students/me/notifications'
    : `/${role}/me/notifications`;
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

export function Topbar({
  role,
  pageTitle,
  userName,
  userTag,
  profilePicture,
  menuOpen = false,
  onMenuToggle,
}: TopbarProps) {
  const { signOut } = useAuthStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const morePanel = useRef<HTMLDivElement>(null);
  const { dark, toggleDark } = useTheme();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationPanel = useRef<HTMLDivElement>(null);
  const endpoint = notificationEndpoint(role);
  const queryKey = ['notifications', role];
  const {
    data: notifications = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey,
    queryFn: async () => (await api.get<Notification[]>(endpoint)).data,
    refetchInterval: 5_000,
  });

  const orderedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
      ),
    [notifications]
  );

  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`${endpoint}/${id}/read`),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });

  useEffect(() => {
    if (role !== 'student') return;
    const refresh = () => client.invalidateQueries({ queryKey });
    notificationSocket.on('notification:new', refresh);
    return () => {
      notificationSocket.off('notification:new', refresh);
    };
  }, [client, role]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const close = (event: MouseEvent) => {
      if (!notificationPanel.current?.contains(event.target as Node))
        setNotificationsOpen(false);
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false);
    };

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      if (!morePanel.current?.contains(event.target as Node))
        setMoreOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [moreOpen]);

  const logout = async () => {
    setMoreOpen(false);
    await api.post('/auth/logout').catch(() => undefined);
    signOut();
    navigate('/');
  };

  const initials = userName
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('');

  return (
    <div
      className="app-topbar z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-3 backdrop-blur-glass sm:h-[84px] sm:px-8"
      style={{ background: 'var(--surface)' }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenuToggle}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-text-2 hover:bg-brand-soft hover:text-brand lg:hidden"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
        >
          <Menu size={22} />
        </button>
        <div className="min-w-0">
          <div className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
            {role}
          </div>
          <div className="truncate font-head text-[17px] font-bold tracking-tight text-text-1 sm:text-[20px]">
            {pageTitle}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          onClick={toggleDark}
          className="hidden h-9 w-9 cursor-pointer sm:flex items-center justify-center rounded-[10px] border border-border bg-surface text-text-2 transition-colors hover:bg-brand-soft hover:text-brand"
          aria-label={dark ? 'Use light mode' : 'Use dark mode'}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className="relative" ref={notificationPanel}>
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-surface text-text-2 transition-colors hover:bg-brand-soft hover:text-brand"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1 flex min-h-3.5 min-w-3.5 items-center justify-center rounded-full bg-risk-high px-1 text-[8px] font-bold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div
              role="dialog"
              aria-label="Notifications"
              className="fixed inset-x-3 top-[68px] z-50 overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface shadow-raised"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="font-head text-sm font-bold text-text-1">
                    Notifications
                  </div>
                  <div className="text-[11px] text-text-3">
                    Latest activity appears first
                  </div>
                </div>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-brand-soft px-2 py-1 text-[10px] font-bold text-brand">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="max-h-[min(480px,70dvh)] overflow-y-auto">
                {isLoading && (
                  <div className="px-4 py-8 text-center text-sm text-text-3">
                    Loading notifications…
                  </div>
                )}
                {isError && (
                  <div className="px-4 py-8 text-center text-sm text-risk-high">
                    Could not load notifications.
                  </div>
                )}
                {!isLoading &&
                  !isError &&
                  orderedNotifications.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-text-3">
                      You have no notifications yet.
                    </div>
                  )}
                {orderedNotifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={markRead.isPending && markRead.variables === item.id}
                    onClick={() => {
                      if (!item.isRead) markRead.mutate(item.id);
                      if (item.link) {
                        setNotificationsOpen(false);
                        navigate(item.link);
                      }
                    }}
                    className="flex w-full cursor-pointer items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-brand-soft disabled:cursor-default disabled:opacity-100"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? 'bg-border-strong' : 'bg-brand'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[12.5px] leading-relaxed text-text-1 ${item.isRead ? 'font-normal' : 'font-semibold'}`}
                      >
                        {item.message}
                      </span>
                      <span className="mt-1 block text-[10.5px] text-text-3">
                        {formatNotificationTime(item.createdAt)}
                      </span>
                    </span>
                    {item.isRead && (
                      <Check
                        size={14}
                        className="mt-1 shrink-0 text-risk-low"
                        aria-label="Read"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative sm:hidden" ref={morePanel}>
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface text-text-2 hover:bg-brand-soft hover:text-brand"
            aria-label="More options"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
          >
            <MoreVertical size={17} />
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 top-11 z-50 w-[min(260px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-raised"
            >
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full font-head text-[13px] font-bold text-white"
                  style={{ background: 'var(--brand-gradient)' }}
                >
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-text-1">
                    {userName}
                  </div>
                  <div className="truncate text-[11px] text-text-3">
                    {userTag}
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  navigate(`/${role}/profile`);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13.5px] text-text-1 hover:bg-brand-soft"
              >
                <User size={16} className="text-text-3" /> Profile & settings
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  toggleDark();
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13.5px] text-text-1 hover:bg-brand-soft"
              >
                {dark ? (
                  <Sun size={16} className="text-text-3" />
                ) : (
                  <Moon size={16} className="text-text-3" />
                )}
                {dark ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left text-[13.5px] text-risk-high hover:bg-brand-soft"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          )}
        </div>
        <div className="hidden items-center gap-2.5 border-l border-border pl-2.5 sm:flex">
          <div
            className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full font-head text-[13px] font-bold text-white shadow-glow"
            style={{ background: 'var(--brand-gradient)' }}
          >
            {profilePicture ? (
              <img
                src={profilePicture}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="hidden md:block">
            <div className="font-body text-[12.5px] font-semibold text-text-1">
              {userName}
            </div>
            <div className="font-body text-[11px] text-text-3">{userTag}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

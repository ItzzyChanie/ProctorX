import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Moon, Sun } from "lucide-react";
import { api } from "../../lib/api";
import { useTheme } from "../../lib/useTheme";
import type { Role } from "../../types/dashboard";
import { notificationSocket } from "../../lib/socket";

type TopbarProps = { role: Role; pageTitle: string; userName: string; userTag: string };
type Notification = { id: string; type: string; message: string; isRead: boolean; createdAt: string };
const notificationEndpoint = (role: Role) => role === "student" ? "/students/me/notifications" : `/${role}/me/notifications`;
const formatNotificationTime = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
}).format(new Date(value));

export function Topbar({ role, pageTitle, userName, userTag }: TopbarProps) {
  const { dark, toggleDark } = useTheme();
  const client = useQueryClient();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationPanel = useRef<HTMLDivElement>(null);
  const endpoint = notificationEndpoint(role);
  const queryKey = ["notifications", role];
  const { data: notifications = [], isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => (await api.get<Notification[]>(endpoint)).data,
    refetchInterval: 5_000,
  });

  const orderedNotifications = useMemo(
    () => [...notifications].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [notifications],
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
    return () => { notificationSocket.off('notification:new', refresh); };
  }, [client, role]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const close = (event: MouseEvent) => {
      if (!notificationPanel.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [notificationsOpen]);

  const initials = userName.split(" ").map((word) => word[0]).slice(0, 2).join("");
  
  return (
    <div className="app-topbar z-10 flex h-[84px] shrink-0 items-center justify-between border-b border-border px-5 backdrop-blur-glass sm:px-8" style={{ background: "var(--surface)" }}>
      <div>
        <div className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-brand">{role}</div>
        <div className="font-head text-[20px] font-bold tracking-tight text-text-1">{pageTitle}</div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={toggleDark} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-surface text-text-2 transition-colors hover:bg-brand-soft hover:text-brand" aria-label={dark ? "Use light mode" : "Use dark mode"}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className="relative" ref={notificationPanel}>
          <button type="button" onClick={() => setNotificationsOpen((open) => !open)} className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-surface text-text-2 transition-colors hover:bg-brand-soft hover:text-brand" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={notificationsOpen} aria-haspopup="dialog">
            <Bell size={16} />
            {unreadCount > 0 && <span className="absolute right-1.5 top-1 flex min-h-3.5 min-w-3.5 items-center justify-center rounded-full bg-risk-high px-1 text-[8px] font-bold leading-none text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          {notificationsOpen && (
            <div role="dialog" aria-label="Notifications" className="absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-raised">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div><div className="font-head text-sm font-bold text-text-1">Notifications</div><div className="text-[11px] text-text-3">Latest activity appears first</div></div>
                {unreadCount > 0 && <span className="rounded-full bg-brand-soft px-2 py-1 text-[10px] font-bold text-brand">{unreadCount} new</span>}
              </div>
              <div className="max-h-[min(480px,70vh)] overflow-y-auto">
                {isLoading && <div className="px-4 py-8 text-center text-sm text-text-3">Loading notifications…</div>}
                {isError && <div className="px-4 py-8 text-center text-sm text-risk-high">Could not load notifications.</div>}
                {!isLoading && !isError && orderedNotifications.length === 0 && <div className="px-4 py-8 text-center text-sm text-text-3">You have no notifications yet.</div>}
                {orderedNotifications.map((item) => (
                  <button key={item.id} type="button" disabled={item.isRead || (markRead.isPending && markRead.variables === item.id)} onClick={() => markRead.mutate(item.id)} className="flex w-full cursor-pointer items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-brand-soft disabled:cursor-default disabled:opacity-100">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? "bg-border-strong" : "bg-brand"}`} />
                    <span className="min-w-0 flex-1"><span className={`block text-[12.5px] leading-relaxed text-text-1 ${item.isRead ? "font-normal" : "font-semibold"}`}>{item.message}</span><span className="mt-1 block text-[10.5px] text-text-3">{formatNotificationTime(item.createdAt)}</span></span>
                    {item.isRead && <Check size={14} className="mt-1 shrink-0 text-risk-low" aria-label="Read" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5 border-l border-border pl-2.5">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full font-head text-[13px] font-bold text-white shadow-glow" style={{ background: "var(--brand-gradient)" }}>{initials}</div>
          <div className="hidden md:block"><div className="font-body text-[12.5px] font-semibold text-text-1">{userName}</div><div className="font-body text-[11px] text-text-3">{userTag}</div></div>
        </div>
      </div>
    </div>
  );
}

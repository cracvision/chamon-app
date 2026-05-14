import { useState } from "react";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/lib/vendors";
import { useI18n } from "@/lib/i18n";

export function NotificationsBell() {
  const { t } = useI18n();
  const { data = [] } = useNotifications(20);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);

  const unreadIds = data.filter((n) => !n.read_at).map((n) => n.id);
  const unread = unreadIds.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("notifications.title")}
          className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-card-elevated hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-accent-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">{t("notifications.title")}</p>
          {unread > 0 && (
            <button
              onClick={() => markAll.mutate(unreadIds)}
              className="font-mono text-[10px] uppercase tracking-wider text-accent hover:underline"
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {data.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {t("notifications.empty")}
            </p>
          )}
          {data.map((n) => {
            const typeLabel = t(`notif.type.${n.type}` as any) || n.type;
            return (
              <button
                key={n.id}
                onClick={() => !n.read_at && markRead.mutate(n.id)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2 text-left text-xs transition-colors hover:bg-card-elevated ${
                  n.read_at ? "opacity-60" : ""
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                    {typeLabel}
                  </span>
                  {!n.read_at && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  )}
                </div>
                {n.subject && <p className="text-sm text-foreground">{n.subject}</p>}
                <div className="flex w-full items-center justify-between font-mono text-[10px] text-muted-foreground">
                  <span>
                    {n.channel} · {n.status}
                  </span>
                  <span>{new Date(n.sent_at).toLocaleString()}</span>
                </div>
                {n.error && <p className="text-[10px] text-destructive">{n.error}</p>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

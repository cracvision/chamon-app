import { createFileRoute, Outlet, Navigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Radar, LayoutDashboard, Sun, Calendar, Users, Settings, LogOut, Plus, Trophy, MessageCircle, MessageCircleOff, Bot, Building2, ListChecks, Wrench } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { Button } from "@/components/ui/button";
import { QuickAddDialog } from "@/components/QuickAddDialog";
import { ChamonVoiceWidget } from "@/components/ChamonVoiceWidget";
import { XpHud } from "@/components/XpHud";
import { XpWatcher } from "@/lib/xp-watcher";
import { NotificationsBell } from "@/components/NotificationsBell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading, signOut } = useAuth();
  const { t } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [quickOpen, setQuickOpen] = useState(false);
  const [agentHidden, setAgentHidden] = useState(true);
  const path = useRouterState({ select: s => s.location.pathname });

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p className="label-mono">loading…</p></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;

  const navItems = [
    { to: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { to: "/today", label: t("nav.today"), icon: Sun },
    { to: "/achievements", label: t("nav.achievements"), icon: Trophy },
    { to: "/calendar", label: t("nav.calendar"), icon: Calendar },
    { to: "/contacts", label: t("nav.contacts"), icon: Users },
    { to: "/operations/reservations", label: "Reservations", icon: ListChecks },
    { to: "/operations/vista-pelican", label: "Vista Pelícano", icon: Building2 },
    { to: "/operations/maintenance", label: "Mantenimiento", icon: Wrench },
    { to: "/agent", label: "Agent", icon: Bot },
    { to: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  const time = now.toLocaleTimeString("en-GB", { hour12: false });

  return (
    <div className="min-h-screen bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/90 px-2 backdrop-blur lg:gap-3 lg:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:gap-3">
          <img
            src="https://yvfkkdvhizjdpouoewch.supabase.co/storage/v1/object/public/images/mch_logo.png"
            alt="Mission Control logo"
            className="h-7 w-7 shrink-0 rounded-md object-contain lg:h-8 lg:w-8"
          />
          <div className="min-w-0 leading-tight">
            <p className="truncate whitespace-nowrap text-[12px] font-semibold lg:text-[13px]">{t("app.name")}</p>
            <p className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground lg:block">{t("app.tagline")}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 lg:gap-3">
          <XpHud />
          <span className="hidden font-mono text-[12px] tabular-nums text-muted-foreground xl:inline">{time} AST</span>
          <NotificationsBell />
          <LangToggle />
          <button
            onClick={() => setAgentHidden(v => !v)}
            aria-pressed={!agentHidden}
            aria-label={agentHidden ? t("agent.show") : t("agent.hide")}
            title={agentHidden ? t("agent.show") : t("agent.hide")}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-card-elevated hover:text-foreground lg:hidden"
          >
            {agentHidden ? <MessageCircle className="h-4 w-4" /> : <MessageCircleOff className="h-4 w-4 text-accent" />}
          </button>
          <Button size="sm" onClick={() => setQuickOpen(true)} className="h-8 w-8 p-0 bg-accent text-accent-foreground hover:bg-accent/90 lg:w-auto lg:px-3" aria-label={t("quickAdd")}>
            <Plus className="h-4 w-4 lg:mr-1" /><span className="hidden lg:inline">{t("quickAdd")}</span>
          </Button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-border bg-card lg:block">
          <nav className="flex flex-col gap-0.5 p-3">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = path === item.to || path.startsWith(item.to + "/");
              return (
                <Link key={item.to} to={item.to}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? "bg-card-elevated text-foreground" : "text-muted-foreground hover:bg-card-elevated hover:text-foreground"
                  }`}>
                  <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-border p-3">
            <button
              onClick={() => setAgentHidden(v => !v)}
              aria-pressed={!agentHidden}
              className="mb-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-card-elevated hover:text-foreground"
            >
              {agentHidden ? <MessageCircle className="h-4 w-4" /> : <MessageCircleOff className="h-4 w-4 text-accent" />}
              {agentHidden ? t("agent.show") : t("agent.hide")}
            </button>
            <div className="mb-2 px-2">
              <p className="label-mono">user</p>
              <p className="truncate text-xs text-foreground">{user.email}</p>
            </div>
            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-card-elevated hover:text-foreground">
              <LogOut className="h-4 w-4" />{t("nav.signout")}
            </button>
          </div>
        </aside>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-border bg-card lg:hidden">
          {navItems.filter(i => !["/agent","/achievements","/operations/reservations","/operations/vista-pelican","/operations/maintenance"].includes(i.to)).map(item => {
            const Icon = item.icon;
            const active = path === item.to;
            return (
              <Link key={item.to} to={item.to}
                className={`flex flex-col items-center gap-1 py-2 text-[10px] uppercase tracking-wider ${
                  active ? "text-accent" : "text-muted-foreground"
                }`}>
                <Icon className="h-5 w-5" />
                <span className="font-mono">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 pb-20 lg:pb-0">
          <Outlet />
        </main>
      </div>

      <QuickAddDialog open={quickOpen} onOpenChange={setQuickOpen} />
      <ChamonVoiceWidget hidden={agentHidden} />
      <XpWatcher />
    </div>
  );
}

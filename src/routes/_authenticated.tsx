import { createFileRoute, Outlet, Navigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Radar, LayoutDashboard, Sun, Calendar, Users, Settings, LogOut, Plus, Trophy, MessageCircle, MessageCircleOff } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { Button } from "@/components/ui/button";
import { QuickAddDialog } from "@/components/QuickAddDialog";
import { ChamonVoiceWidget } from "@/components/ChamonVoiceWidget";
import { XpHud } from "@/components/XpHud";
import { XpWatcher } from "@/lib/xp-watcher";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading, signOut } = useAuth();
  const { t } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [quickOpen, setQuickOpen] = useState(false);
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
    { to: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  const time = now.toLocaleTimeString("en-GB", { hour12: false });

  return (
    <div className="min-h-screen bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <img
            src="https://yvfkkdvhizjdpouoewch.supabase.co/storage/v1/object/public/images/mch_logo.png"
            alt="Mission Control logo"
            className="h-8 w-8 rounded-md object-contain"
          />
          <div className="leading-tight">
            <p className="text-[13px] font-semibold">{t("app.name")}</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("app.tagline")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <XpHud />
          <span className="hidden font-mono text-[12px] tabular-nums text-muted-foreground md:inline">{time} AST</span>
          <LangToggle />
          <Button size="sm" onClick={() => setQuickOpen(true)} className="h-8 bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="mr-1 h-4 w-4" />{t("quickAdd")}
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
          {navItems.map(item => {
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
      <ChamonVoiceWidget />
      <XpWatcher />
    </div>
  );
}

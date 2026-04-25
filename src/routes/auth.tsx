import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LangToggle } from "@/components/LangToggle";
import { Radar } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) nav({ to: "/dashboard", replace: true }); }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: redirectTo, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success(t("saved"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err?.message || t("error"));
    } finally { setBusy(false); }
  };

  const google = async () => {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{t("app.name")}</p>
            <p className="label-mono">{t("app.tagline")}</p>
          </div>
        </div>
        <LangToggle />
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
        <div>
          <p className="label-mono">{mode === "signin" ? "auth · signin" : "auth · signup"}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {mode === "signin" ? t("auth.signin") : t("auth.signup")}
          </h1>
        </div>

        <Button type="button" variant="outline" onClick={google} className="h-11 border-border-strong bg-card hover:bg-card-elevated">
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          {t("auth.continueGoogle")}
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="label-mono">{t("auth.or")}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 surface p-5">
          {mode === "signup" && (
            <div className="flex flex-col gap-1.5">
              <Label className="label-mono">{t("auth.fullName")}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required className="h-10 bg-card-elevated" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label className="label-mono">{t("auth.email")}</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className="h-10 bg-card-elevated" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="label-mono">{t("auth.password")}</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="h-10 bg-card-elevated" />
          </div>
          <Button type="submit" disabled={busy} className="mt-1 h-11 bg-accent text-accent-foreground hover:bg-accent/90">
            {mode === "signin" ? t("auth.signin") : t("auth.signup")}
          </Button>
        </form>

        <button type="button" onClick={() => setMode(m => m === "signin" ? "signup" : "signin")} className="text-center text-sm text-muted-foreground hover:text-foreground">
          {mode === "signin" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
          <span className="text-accent">{mode === "signin" ? t("auth.signup") : t("auth.signin")}</span>
        </button>
      </main>
    </div>
  );
}

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
import { Radar, Loader2 } from "lucide-react";
import MchSplashScreen from "@/components/MchSplashScreen";

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
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useProfile, useAreas, useInvalidate, type Area } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Send, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { data: areas = [] } = useAreas();
  const invalidate = useInvalidate();

  const [fullName, setFullName] = useState("");
  const [notif, setNotif] = useState("");
  const [hour, setHour] = useState(7);
  const [enabled, setEnabled] = useState(true);
  const [tz, setTz] = useState("America/Puerto_Rico");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setNotif(profile.notification_email || "");
      setHour(profile.digest_hour);
      setEnabled(profile.digest_enabled);
      setTz(profile.timezone);
    }
  }, [profile]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("profiles").update({
      full_name: fullName, notification_email: notif, digest_hour: hour, digest_enabled: enabled, timezone: tz
    }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
    invalidate("profile");
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-digest-now", { body: {} });
      if (error) throw error;
      toast.success(`${t("sent")}${data?.tasks ? ` · ${data.tasks} tasks` : ""}`);
    } catch (e: any) {
      toast.error(e?.message || t("error"));
    } finally { setSending(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:px-6">
      <h1 className="mb-5 text-xl font-semibold tracking-tight">{t("nav.settings")}</h1>

      <form onSubmit={saveProfile} className="surface mb-5 flex flex-col gap-3 p-5">
        <p className="label-mono">{t("settings.profile")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("auth.fullName")}><Input value={fullName} onChange={e => setFullName(e.target.value)} className="bg-card-elevated" /></Field>
          <Field label={t("auth.email")}><Input value={user?.email || ""} disabled className="bg-card-elevated font-mono text-xs" /></Field>
          <Field label={t("settings.timezone")}><Input value={tz} onChange={e => setTz(e.target.value)} className="bg-card-elevated font-mono text-xs" /></Field>
        </div>
        <Button type="submit" className="self-start bg-accent text-accent-foreground hover:bg-accent/90">{t("save")}</Button>
      </form>

      <div className="surface mb-5 flex flex-col gap-3 p-5">
        <p className="label-mono">{t("settings.digest")}</p>
        <div className="flex items-center justify-between">
          <Label>{t("settings.digest.enabled")}</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("settings.digest.email")}><Input type="email" value={notif} onChange={e => setNotif(e.target.value)} className="bg-card-elevated" /></Field>
          <Field label={t("settings.digest.hour")}><Input type="number" min="0" max="23" value={hour} onChange={e => setHour(Number(e.target.value))} className="bg-card-elevated font-mono" /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={saveProfile} variant="outline" className="border-border-strong bg-card-elevated">{t("save")}</Button>
          <Button type="button" onClick={sendNow} disabled={sending} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Send className="mr-2 h-4 w-4" />{sending ? t("loading") : t("settings.digest.send")}
          </Button>
        </div>
      </div>

      <AreasManager areas={areas} />

      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={signOut} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          {t("nav.signout")}
        </Button>
      </div>
    </div>
  );
}

function AreasManager({ areas }: { areas: Area[] }) {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("#f59e0b");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabase.from("areas").insert({ name: name.trim(), code: code || null, color } as any);
    if (error) return toast.error(error.message);
    setName(""); setCode("");
    invalidate("areas");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("areas").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    invalidate("areas");
  };

  return (
    <div className="surface flex flex-col gap-3 p-5">
      <p className="label-mono">{t("areas")}</p>
      <ul className="flex flex-col gap-1.5">
        {areas.map(a => (
          <li key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-card-elevated px-2.5 py-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: a.color || "var(--accent)" }} />
            {a.code && <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{a.code}</span>}
            <span className="flex-1 text-sm">{a.name}</span>
            <button onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("area.name")} value={name} onChange={e => setName(e.target.value)} className="h-9 flex-1 bg-card-elevated" />
        <Input placeholder={t("area.code")} value={code} onChange={e => setCode(e.target.value)} className="h-9 w-24 bg-card-elevated font-mono uppercase" maxLength={6} />
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border border-border bg-card-elevated" />
        <Button type="submit" size="sm" className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><Label className="label-mono">{label}</Label>{children}</div>;
}

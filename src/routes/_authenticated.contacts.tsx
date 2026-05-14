import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useContacts, useInvalidate, type Contact } from "@/lib/queries";
import { useAssignmentsForContact, CONTACT_CATEGORIES } from "@/lib/vendors";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Mail, Phone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { normalizeE164 } from "@/lib/phone";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
});

type Channel = "auto" | "email" | "whatsapp";

type Editing = Partial<Contact> & {
  categories?: string[];
  whatsapp_phone?: string | null;
  preferred_channel?: string | null;
};

function ContactsPage() {
  const { t } = useI18n();
  const { data: contacts = [] } = useContacts();
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState<Editing | null>(null);

  const toggleCat = (cat: string) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const cats = new Set(prev.categories ?? []);
      if (cats.has(cat)) cats.delete(cat);
      else cats.add(cat);
      return { ...prev, categories: Array.from(cats) };
    });
  };

  const onWhatsappBlur = (raw: string) => {
    if (!raw.trim()) {
      setEditing((p) => (p ? { ...p, whatsapp_phone: null } : p));
      return;
    }
    const e164 = normalizeE164(raw);
    if (!e164) {
      toast.error(t("contact.invalidPhone"));
      return;
    }
    setEditing((p) => (p ? { ...p, whatsapp_phone: e164 } : p));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.name) return;
    const payload = {
      name: editing.name,
      role: editing.role || null,
      phone: editing.phone || null,
      email: editing.email || null,
      notes: editing.notes || null,
      categories: editing.categories ?? [],
      whatsapp_phone: editing.whatsapp_phone || null,
      preferred_channel: editing.preferred_channel || null,
    };
    if (editing.id) {
      const { error } = await supabase.from("contacts").update(payload as any).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("contacts").insert(payload as any);
      if (error) return toast.error(error.message);
    }
    toast.success(t("saved"));
    setEditing(null);
    invalidate("contacts");
  };

  const remove = async (id: string) => {
    // Check active vendor assignments
    const { data: assigns } = await supabase
      .from("property_vendor_assignments")
      .select("id")
      .eq("contact_id", id)
      .is("deleted_at", null);
    const hasAssign = (assigns ?? []).length > 0;
    const msg = hasAssign ? t("contact.deleteWarn") : t("delete") + "?";
    if (!confirm(msg)) return;
    const { error } = await supabase
      .from("contacts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("deleted"));
    invalidate("contacts");
  };

  const channel = (editing?.preferred_channel ?? "auto") as Channel;

  return (
    <div className="px-4 py-6 lg:px-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{t("nav.contacts")}</h1>
        <Button size="sm" onClick={() => setEditing({ categories: [], preferred_channel: "auto" })} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="mr-1 h-4 w-4" />{t("contact.new")}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_400px]">
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.length === 0 && <p className="surface p-6 text-center text-xs text-muted-foreground">—</p>}
          {contacts.map((c: any) => (
            <div key={c.id} className="surface flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  {c.role && <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.role}</p>}
                </div>
                <button onClick={() => remove(c.id)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {(c.categories ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(c.categories as string[]).map((cat) => (
                    <span key={cat} className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
                      {t(`contact.cat.${cat}` as any) || cat}
                    </span>
                  ))}
                </div>
              )}
              {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-accent"><Phone className="h-3 w-3" />{c.phone}</a>}
              {c.whatsapp_phone && <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground"><MessageCircle className="h-3 w-3" />{c.whatsapp_phone}</span>}
              {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-accent"><Mail className="h-3 w-3" />{c.email}</a>}
              {c.preferred_channel && <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">→ {c.preferred_channel}</p>}
              {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
              <button onClick={() => setEditing({ ...c, categories: c.categories ?? [], preferred_channel: c.preferred_channel ?? "auto" })} className="mt-1 self-start font-mono text-[10px] uppercase tracking-wider text-accent hover:underline">{t("edit")}</button>
            </div>
          ))}
        </div>

        {editing && (
          <form onSubmit={save} className="surface flex h-fit flex-col gap-3 p-4 lg:sticky lg:top-20">
            <p className="label-mono">{editing.id ? t("edit") : t("contact.new")}</p>
            <Input placeholder={t("contact.name")} required value={editing.name || ""} onChange={e => setEditing({...editing, name: e.target.value})} className="bg-card-elevated" />
            <Input placeholder={t("contact.role")} value={editing.role || ""} onChange={e => setEditing({...editing, role: e.target.value})} className="bg-card-elevated" />

            <div>
              <p className="label-mono mb-1.5">{t("contact.categories")}</p>
              <div className="flex flex-wrap gap-1.5">
                {CONTACT_CATEGORIES.map((cat) => {
                  const active = (editing.categories ?? []).includes(cat);
                  return (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => toggleCat(cat)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${active ? "border-accent/50 bg-accent/15 text-accent" : "border-border text-muted-foreground hover:bg-card-elevated"}`}
                    >
                      {t(`contact.cat.${cat}` as any) || cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <Input placeholder={t("contact.phone")} value={editing.phone || ""} onChange={e => setEditing({...editing, phone: e.target.value})} className="bg-card-elevated" />
            <Input
              placeholder={t("contact.whatsapp") + " (E.164)"}
              value={editing.whatsapp_phone || ""}
              onChange={e => setEditing({...editing, whatsapp_phone: e.target.value})}
              onBlur={(e) => onWhatsappBlur(e.target.value)}
              className="bg-card-elevated font-mono text-xs"
            />
            <Input type="email" placeholder={t("contact.email")} value={editing.email || ""} onChange={e => setEditing({...editing, email: e.target.value})} className="bg-card-elevated" />

            <div>
              <p className="label-mono mb-1.5">{t("contact.preferredChannel")}</p>
              <div className="flex gap-3 text-sm">
                {(["auto", "email", "whatsapp"] as Channel[]).map((ch) => (
                  <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="channel"
                      value={ch}
                      checked={channel === ch}
                      onChange={() => setEditing({ ...editing, preferred_channel: ch })}
                    />
                    <span>{t(`contact.channel.${ch}` as any)}</span>
                  </label>
                ))}
              </div>
            </div>

            <Textarea rows={3} placeholder={t("contact.notes")} value={editing.notes || ""} onChange={e => setEditing({...editing, notes: e.target.value})} className="bg-card-elevated" />

            {editing.id && <ContactAssignmentsInfo contactId={editing.id} />}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90">{t("save")}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ContactAssignmentsInfo({ contactId }: { contactId: string }) {
  const q = useAssignmentsForContact(contactId);
  const data = q.data ?? [];
  if (data.length === 0) return null;
  return (
    <p className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-300">
      {data.length} asignación(es) activa(s) en propiedades
    </p>
  );
}

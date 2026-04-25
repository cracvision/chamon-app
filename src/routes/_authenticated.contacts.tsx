import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useContacts, useInvalidate, type Contact } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
});

function ContactsPage() {
  const { t } = useI18n();
  const { data: contacts = [] } = useContacts();
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.name) return;
    if (editing.id) {
      const { error } = await supabase.from("contacts").update({
        name: editing.name, role: editing.role, phone: editing.phone, email: editing.email, notes: editing.notes
      }).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("contacts").insert({
        name: editing.name!, role: editing.role || null, phone: editing.phone || null, email: editing.email || null, notes: editing.notes || null
      } as any);
      if (error) return toast.error(error.message);
    }
    toast.success(t("saved"));
    setEditing(null);
    invalidate("contacts");
  };

  const remove = async (id: string) => {
    if (!confirm(t("delete") + "?")) return;
    const { error } = await supabase.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("deleted"));
    invalidate("contacts");
  };

  return (
    <div className="px-4 py-6 lg:px-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{t("nav.contacts")}</h1>
        <Button size="sm" onClick={() => setEditing({})} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="mr-1 h-4 w-4" />{t("contact.new")}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.length === 0 && <p className="surface p-6 text-center text-xs text-muted-foreground">—</p>}
          {contacts.map(c => (
            <div key={c.id} className="surface flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  {c.role && <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.role}</p>}
                </div>
                <button onClick={() => remove(c.id)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-accent"><Phone className="h-3 w-3" />{c.phone}</a>}
              {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-accent"><Mail className="h-3 w-3" />{c.email}</a>}
              {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
              <button onClick={() => setEditing(c)} className="mt-1 self-start font-mono text-[10px] uppercase tracking-wider text-accent hover:underline">{t("edit")}</button>
            </div>
          ))}
        </div>

        {editing && (
          <form onSubmit={save} className="surface flex h-fit flex-col gap-3 p-4 lg:sticky lg:top-20">
            <p className="label-mono">{editing.id ? t("edit") : t("contact.new")}</p>
            <Input placeholder={t("contact.name")} required value={editing.name || ""} onChange={e => setEditing({...editing, name: e.target.value})} className="bg-card-elevated" />
            <Input placeholder={t("contact.role")} value={editing.role || ""} onChange={e => setEditing({...editing, role: e.target.value})} className="bg-card-elevated" />
            <Input placeholder={t("contact.phone")} value={editing.phone || ""} onChange={e => setEditing({...editing, phone: e.target.value})} className="bg-card-elevated" />
            <Input type="email" placeholder={t("contact.email")} value={editing.email || ""} onChange={e => setEditing({...editing, email: e.target.value})} className="bg-card-elevated" />
            <Textarea rows={3} placeholder={t("contact.notes")} value={editing.notes || ""} onChange={e => setEditing({...editing, notes: e.target.value})} className="bg-card-elevated" />
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

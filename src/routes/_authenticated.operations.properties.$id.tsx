import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContacts } from "@/lib/queries";
import {
  useVendorAssignmentsForProperty,
  useAssignVendor,
  useRemoveVendorAssignment,
  VENDOR_CATEGORIES,
  type VendorCategory,
} from "@/lib/vendors";
import { useI18n } from "@/lib/i18n";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PropertyAssetsTab } from "@/components/operations/PropertyAssetsTab";

export const Route = createFileRoute("/_authenticated/operations/properties/$id")({
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { id } = useParams({ from: "/_authenticated/operations/properties/$id" });
  const { t } = useI18n();

  const propQ = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, code, address, calendar_id, calendar_timezone, is_active, notes")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const property = propQ.data;

  if (propQ.isLoading) {
    return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!property) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center text-sm text-muted-foreground">Property not found</Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/operations/vista-pelican" className="inline-flex items-center gap-1 hover:text-accent">
          <ArrowLeft className="h-3 w-3" />Vista Pelícano
        </Link>
        <span>/</span>
        <span>{property.name}</span>
      </div>

      <Card className="mb-4 p-4">
        <h1 className="text-lg font-semibold">{property.name}</h1>
        <p className="label-mono mt-1">{property.code ?? "—"}</p>
        {property.address && <p className="mt-1 text-sm text-muted-foreground">{property.address}</p>}
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">{t("property.tab.overview")}</TabsTrigger>
          <TabsTrigger value="assets">{t("property.tab.assets")}</TabsTrigger>
          <TabsTrigger value="vendors">{t("property.tab.vendors")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-4 space-y-2 text-sm">
            <Row label="Calendar ID" value={property.calendar_id ?? "—"} mono />
            <Row label="Timezone" value={property.calendar_timezone ?? "—"} />
            <Row label="Active" value={property.is_active ? "Yes" : "No"} />
            {property.notes && (
              <div className="pt-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{property.notes}</p>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <PropertyAssetsTab propertyId={id} />
        </TabsContent>

        <TabsContent value="vendors" className="mt-4">
          <VendorsTab propertyId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "text-sm"}>{value}</span>
    </div>
  );
}

function VendorsTab({ propertyId }: { propertyId: string }) {
  const { t } = useI18n();
  const assignQ = useVendorAssignmentsForProperty(propertyId);
  const contactsQ = useContacts();
  const assignMut = useAssignVendor(propertyId);
  const removeMut = useRemoveVendorAssignment(propertyId);

  const assignments = assignQ.data ?? [];
  const contacts = contactsQ.data ?? [];
  const [picks, setPicks] = useState<Record<string, string>>({});

  const findPrimary = (cat: VendorCategory) =>
    assignments.find((a) => a.vendor_category === cat && a.is_primary);

  const onAssign = async (cat: VendorCategory) => {
    const contact_id = picks[cat];
    if (!contact_id) {
      toast.error(t("vendors.selectContact"));
      return;
    }
    try {
      await assignMut.mutateAsync({ vendor_category: cat, contact_id });
      toast.success(t("saved"));
      setPicks((p) => ({ ...p, [cat]: "" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "error");
    }
  };

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("vendors.title")}</h2>
      <div className="space-y-4">
        {VENDOR_CATEGORIES.map((cat) => {
          const primary = findPrimary(cat);
          const primaryContact = primary
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? contacts.find((c: any) => c.id === primary.contact_id)
            : null;
          const eligible = contacts.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c: any) => (c.categories ?? []).includes(cat),
          );
          return (
            <div key={cat} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {t(`contact.cat.${cat}` as any) || cat}
                </p>
                {primary && (
                  <button
                    onClick={() => removeMut.mutate(primary.id)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    title={t("delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {primaryContact ? (
                <div className="mb-2 rounded bg-card-elevated p-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <p className="text-sm">{(primaryContact as any).name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(primaryContact as any).preferred_channel ?? "auto"} ·{" "}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(primaryContact as any).whatsapp_phone ??
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (primaryContact as any).email ??
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (primaryContact as any).phone ??
                      "—"}
                  </p>
                </div>
              ) : (
                <p className="mb-2 text-xs text-muted-foreground">{t("vendors.none")}</p>
              )}
              <div className="flex items-center gap-2">
                <Select
                  value={picks[cat] ?? ""}
                  onValueChange={(v) => setPicks((p) => ({ ...p, [cat]: v }))}
                >
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder={t("vendors.selectContact")} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.length === 0 && (
                      <div className="p-2 text-xs text-muted-foreground">—</div>
                    )}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {eligible.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => onAssign(cat)}
                  disabled={!picks[cat] || assignMut.isPending}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {primary ? t("vendors.replace") : t("vendors.assign")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_BADGE,
  assetSchema,
  type Asset,
  type AssetCategory,
  type AssetFormValues,
  type AssetWithCounts,
  useAssetsWithCounts,
  useCreateAsset,
  useUpdateAsset,
  useSoftDeleteAsset,
  warrantyState,
} from "@/lib/maintenance";

function emptyAsset(): AssetFormValues {
  return {
    name: "",
    category: "other",
    brand: "",
    model: "",
    serial_number: "",
    purchase_date: "",
    warranty_expires_at: "",
    notes: "",
  };
}

export function PropertyAssetsTab({ propertyId }: { propertyId: string }) {
  const { t } = useI18n();
  const assetsQ = useAssetsWithCounts(propertyId);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<AssetFormValues>(emptyAsset());
  const [confirmDelete, setConfirmDelete] = useState<Asset | null>(null);

  const createMut = useCreateAsset(propertyId);
  const updateMut = useUpdateAsset(propertyId);
  const deleteMut = useSoftDeleteAsset(propertyId);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyAsset());
    setSheetOpen(true);
  };
  const openEdit = (a: Asset) => {
    setEditing(a);
    setForm({
      name: a.name,
      category: a.category ?? "other",
      brand: a.brand ?? "",
      model: a.model ?? "",
      serial_number: a.serial_number ?? "",
      purchase_date: a.purchase_date ?? "",
      warranty_expires_at: a.warranty_expires_at ?? "",
      notes: a.notes ?? "",
    });
    setSheetOpen(true);
  };

  const onSave = async () => {
    const parsed = assetSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Validación falló");
      return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, values: parsed.data });
        toast.success(t("saved"));
      } else {
        await createMut.mutateAsync(parsed.data);
        toast.success(t("create"));
      }
      setSheetOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "error");
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteMut.mutateAsync(confirmDelete.id);
      toast.success(t("delete"));
      setConfirmDelete(null);
      if (editing?.id === confirmDelete.id) setSheetOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {assetsQ.data?.length ?? 0} {t("section.attachments").toLowerCase() === "attachments" ? "assets" : "items"}
        </p>
        <Button
          size="sm"
          onClick={openCreate}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("asset.new")}
        </Button>
      </div>

      {assetsQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !assetsQ.data || assetsQ.data.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t("asset.empty")}
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2">{t("asset.name")}</th>
                <th className="px-2 py-2">{t("asset.category")}</th>
                <th className="px-2 py-2">{t("asset.brand")} · {t("asset.model")}</th>
                <th className="px-2 py-2">{t("asset.serial")}</th>
                <th className="px-2 py-2">{t("asset.warrantyExpiresAt")}</th>
                <th className="px-2 py-2 text-right">{t("asset.incidents")}</th>
              </tr>
            </thead>
            <tbody>
              {assetsQ.data.map((a: AssetWithCounts) => (
                <AssetRow key={a.id} asset={a} onClick={() => openEdit(a)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? t("asset.edit") : t("asset.new")}</SheetTitle>
            {editing && (
              <SheetDescription className="font-mono text-[10px]">
                {editing.id}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <Field label={t("asset.name") + " *"}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={200}
              />
            </Field>

            <Field label={t("asset.category") + " *"}>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`asset.cat.${c}` as const)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("asset.brand")}>
                <Input
                  value={form.brand ?? ""}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  maxLength={100}
                />
              </Field>
              <Field label={t("asset.model")}>
                <Input
                  value={form.model ?? ""}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  maxLength={100}
                />
              </Field>
            </div>

            <Field label={t("asset.serial")}>
              <Input
                value={form.serial_number ?? ""}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                maxLength={100}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("asset.purchaseDate")}>
                <Input
                  type="date"
                  value={form.purchase_date ?? ""}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                />
              </Field>
              <Field label={t("asset.warrantyExpiresAt")}>
                <Input
                  type="date"
                  value={form.warranty_expires_at ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, warranty_expires_at: e.target.value })
                  }
                />
              </Field>
            </div>

            <Field label={t("asset.notes")}>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={2000}
                rows={3}
              />
            </Field>
          </div>

          <SheetFooter className="mt-6 flex-row justify-between gap-2 sm:justify-between">
            {editing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(editing)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {t("delete")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSheetOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                onClick={onSave}
                disabled={createMut.isPending || updateMut.isPending}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {t("save")}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("asset.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function AssetRow({ asset, onClick }: { asset: AssetWithCounts; onClick: () => void }) {
  const { t } = useI18n();
  const cat = asset.category ?? "other";
  const badgeCls =
    ASSET_CATEGORY_BADGE[cat as AssetCategory] ?? ASSET_CATEGORY_BADGE.other;
  const warranty = warrantyState(asset.warranty_expires_at);

  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-border/50 hover:bg-card-elevated"
    >
      <td className="px-2 py-2">
        <div className="font-medium">{asset.name}</div>
        {asset.notes && (
          <div
            className="mt-0.5 max-w-[200px] truncate text-[10px] text-muted-foreground"
            title={asset.notes}
          >
            {asset.notes}
          </div>
        )}
      </td>
      <td className="px-2 py-2">
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] ${badgeCls}`}
        >
          {t(`asset.cat.${cat}` as const) ?? cat}
        </span>
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">
        {[asset.brand, asset.model].filter(Boolean).join(" · ") || "—"}
      </td>
      <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">
        {asset.serial_number ?? "—"}
      </td>
      <td className="px-2 py-2 text-xs">
        {asset.warranty_expires_at ? (
          <div className="flex flex-col">
            <span className="text-muted-foreground">{asset.warranty_expires_at}</span>
            {warranty.label && (
              <span
                className={
                  warranty.tone === "expired"
                    ? "text-destructive"
                    : warranty.tone === "soon"
                      ? "text-orange-400"
                      : "text-muted-foreground"
                }
              >
                {warranty.label}
              </span>
            )}
          </div>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {asset.open_incidents_count > 0 && (
            <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive">
              {asset.open_incidents_count} open
            </span>
          )}
          <span className="text-xs text-muted-foreground">{asset.incidents_count}</span>
        </div>
      </td>
    </tr>
  );
}

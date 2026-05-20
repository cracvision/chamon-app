import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Upload,
  Trash2,
  CheckCircle2,
  Loader2,
  FileText,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { useContacts } from "@/lib/queries";
import {
  ATTACHMENT_ACCEPT,
  INCIDENT_STATUS_TRANSITIONS,
  SEVERITY_BADGE,
  STATUS_BADGE,
  resolveIncidentSchema,
  useDeleteIncidentAttachment,
  useIncident,
  useIncidentAttachments,
  useIncidentTimeline,
  useRegenerateEmbedding,
  useResolveIncident,
  useSoftDeleteIncident,
  useTransitionIncidentStatus,
  useUploadIncidentAttachment,
  type IncidentListItem,
  type IncidentStatus,
} from "@/lib/maintenance";
import { formatBytes } from "@/lib/format";

interface Props {
  incident: IncidentListItem | null;
  open: boolean;
  onClose: () => void;
}

export function IncidentDetailSheet({ incident, open, onClose }: Props) {
  const { t } = useI18n();
  const id = incident?.id ?? null;

  const incidentQ = useIncident(id);
  const timelineQ = useIncidentTimeline(id);
  const attachmentsQ = useIncidentAttachments(id);

  const transitionMut = useTransitionIncidentStatus();
  const resolveMut = useResolveIncident();
  const deleteMut = useSoftDeleteIncident();
  const regenMut = useRegenerateEmbedding();

  const data = incidentQ.data ?? incident;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {!data ? (
          <div className="p-6">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b border-border px-5 pb-3 pt-5">
              <div className="flex items-start justify-between gap-2 pr-6">
                <div className="min-w-0">
                  <SheetTitle className="text-base">{data.title}</SheetTitle>
                  <SheetDescription className="mt-0.5 text-xs">
                    {data.occurred_at?.slice(0, 16).replace("T", " ")}
                  </SheetDescription>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${STATUS_BADGE[data.status]}`}
                >
                  {data.status}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${SEVERITY_BADGE[data.severity]}`}
                >
                  {data.severity}
                </span>
                {data.embedding == null && (
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    embed pending
                  </span>
                )}
                {data.agent_action_id && (
                  <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                    auto-task
                  </span>
                )}
              </div>
            </SheetHeader>

            <Tabs defaultValue="detail" className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="mx-5 mt-3 grid w-auto grid-cols-3">
                <TabsTrigger value="detail">{t("maintenance.tab.detail")}</TabsTrigger>
                <TabsTrigger value="timeline">{t("maintenance.tab.timeline")}</TabsTrigger>
                <TabsTrigger value="attachments">
                  {t("maintenance.tab.attachments")}
                  {attachmentsQ.data && attachmentsQ.data.length > 0 && (
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                      {attachmentsQ.data.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="detail"
                className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
              >
                <div>
                  <p className="label-mono mb-1">Description</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {data.description}
                  </p>
                </div>

                {data.resolution_notes && (
                  <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <p className="label-mono mb-1 text-emerald-400">
                      ✓ {t("maintenance.resolveNotes")}
                    </p>
                    <p className="whitespace-pre-wrap text-xs">{data.resolution_notes}</p>
                    {(data.cost_amount != null || data.resolved_at) && (
                      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                        {data.cost_amount != null
                          ? `${data.cost_amount} ${data.cost_currency ?? "USD"}`
                          : ""}
                        {data.cost_amount != null && data.resolved_at ? " · " : ""}
                        {data.resolved_at?.slice(0, 10)}
                      </p>
                    )}
                  </div>
                )}

                <StatusTransitionRow
                  status={data.status}
                  busy={transitionMut.isPending}
                  onChange={async (to) => {
                    try {
                      await transitionMut.mutateAsync({
                        id: data.id,
                        from: data.status,
                        to,
                      });
                      toast.success(`Status → ${to}`);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "error");
                    }
                  }}
                />

                {data.status !== "resolved" && data.status !== "closed" && (
                  <ResolveForm
                    busy={resolveMut.isPending}
                    onSubmit={async (values) => {
                      try {
                        await resolveMut.mutateAsync({ id: data.id, values });
                        toast.success("Incidente resuelto");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "error");
                      }
                    }}
                  />
                )}

                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={regenMut.isPending}
                    onClick={async () => {
                      try {
                        await regenMut.mutateAsync({
                          incident_id: data.id,
                          text: `${data.title}\n\n${data.description}`,
                        });
                        toast.success("Embedding regenerado");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "error");
                      }
                    }}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {t("maintenance.regenerateEmbedding")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteMut.isPending}
                    onClick={async () => {
                      if (!confirm("¿Eliminar este incidente?")) return;
                      try {
                        await deleteMut.mutateAsync(data.id);
                        toast.success("Eliminado");
                        onClose();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "error");
                      }
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                  </Button>
                </div>
              </TabsContent>

              <TabsContent
                value="timeline"
                className="flex-1 overflow-y-auto px-5 py-4"
              >
                {timelineQ.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : !timelineQ.data || timelineQ.data.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground">
                    {t("maintenance.noTimeline")}
                  </p>
                ) : (
                  <ol className="space-y-2.5">
                    {timelineQ.data.map((ev) => (
                      <li
                        key={ev.id}
                        className="rounded border border-border bg-card-elevated p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">{ev.action}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {ev.created_at.slice(0, 16).replace("T", " ")}
                          </span>
                        </div>
                        {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                          <pre className="mt-1 overflow-x-auto text-[10px] text-muted-foreground">
                            {JSON.stringify(ev.metadata, null, 0)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </TabsContent>

              <TabsContent
                value="attachments"
                className="flex-1 overflow-y-auto px-5 py-4"
              >
                <AttachmentsPanel incidentId={data.id} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatusTransitionRow({
  status,
  busy,
  onChange,
}: {
  status: IncidentStatus;
  busy: boolean;
  onChange: (to: IncidentStatus) => void;
}) {
  const { t } = useI18n();
  const allowed = INCIDENT_STATUS_TRANSITIONS[status] ?? [];
  if (allowed.length === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded border border-border p-2">
      <span className="label-mono shrink-0">{t("maintenance.transitionTo")}</span>
      <Select onValueChange={(v) => onChange(v as IncidentStatus)} disabled={busy}>
        <SelectTrigger className="h-8 flex-1">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {allowed.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}

function ResolveForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (values: {
    resolution_notes: string;
    vendor_contact_id: string | null;
    cost_amount: number | null;
    cost_currency: string;
    resolved_at: string;
  }) => void;
}) {
  const { t } = useI18n();
  const contactsQ = useContacts();
  const vendorOptions = useMemo(
    () =>
      (contactsQ.data ?? []).filter((c) =>
        (c.categories ?? []).some((cat: string) => cat.startsWith("vendor_")),
      ),
    [contactsQ.data],
  );

  const [notes, setNotes] = useState("");
  const [vendor, setVendor] = useState<string>("__none");
  const [cost, setCost] = useState<string>("");
  const [currency, setCurrency] = useState("USD");
  const [resolvedAt, setResolvedAt] = useState(() => {
    const d = new Date();
    d.setMilliseconds(0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });

  return (
    <div className="rounded border border-accent/30 bg-accent/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("maintenance.resolve")}
      </div>

      <div>
        <p className="label-mono mb-1">{t("maintenance.resolveNotes")} *</p>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={5000}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="label-mono mb-1">{t("maintenance.vendor")}</p>
          <Select value={vendor} onValueChange={setVendor}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {vendorOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="label-mono mb-1">{t("maintenance.resolvedAt")}</p>
          <Input
            type="datetime-local"
            value={resolvedAt}
            onChange={(e) => setResolvedAt(e.target.value)}
            className="h-8"
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_80px] gap-2">
        <div>
          <p className="label-mono mb-1">{t("maintenance.cost")}</p>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="h-8"
            placeholder="0.00"
          />
        </div>
        <div>
          <p className="label-mono mb-1">Currency</p>
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            className="h-8"
          />
        </div>
      </div>

      <Button
        size="sm"
        className="w-full"
        disabled={busy}
        onClick={() => {
          const parsed = resolveIncidentSchema.safeParse({
            resolution_notes: notes,
            vendor_contact_id: vendor === "__none" ? null : vendor,
            cost_amount: cost ? Number(cost) : null,
            cost_currency: currency || "USD",
            resolved_at: new Date(resolvedAt).toISOString(),
          });
          if (!parsed.success) {
            toast.error(parsed.error.issues[0]?.message ?? "Validación falló");
            return;
          }
          onSubmit({
            resolution_notes: parsed.data.resolution_notes,
            vendor_contact_id: parsed.data.vendor_contact_id ?? null,
            cost_amount: parsed.data.cost_amount ?? null,
            cost_currency: parsed.data.cost_currency,
            resolved_at: parsed.data.resolved_at,
          });
        }}
      >
        {busy ? "…" : t("maintenance.resolve")}
      </Button>
    </div>
  );
}

function AttachmentsPanel({ incidentId }: { incidentId: string }) {
  const { t } = useI18n();
  const attachmentsQ = useIncidentAttachments(incidentId);
  const uploadMut = useUploadIncidentAttachment();
  const deleteMut = useDeleteIncidentAttachment();
  const [drag, setDrag] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cleanup preview when sheet closes
  useEffect(() => () => setPreviewUrl(null), []);

  const onUpload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      try {
        await uploadMut.mutateAsync({ incident_id: incidentId, file });
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed px-4 py-5 text-center transition-colors ${
          drag ? "border-accent bg-accent/5" : "border-border bg-card-elevated hover:border-border-strong"
        }`}
      >
        <Upload className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {uploadMut.isPending ? "Subiendo…" : t("maintenance.uploadHint")}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          hidden
          onChange={(e) => e.target.files && onUpload(e.target.files)}
        />
      </div>

      {attachmentsQ.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !attachmentsQ.data || attachmentsQ.data.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {t("maintenance.noAttachments")}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {attachmentsQ.data.map((a) => {
            const isImg = (a.mime_type ?? "").startsWith("image/");
            return (
              <li
                key={a.id}
                className="group relative rounded border border-border bg-card-elevated p-2"
              >
                {isImg && a.signed_url ? (
                  <button
                    onClick={() => setPreviewUrl(a.signed_url)}
                    className="block w-full"
                  >
                    <img
                      src={a.signed_url}
                      alt={a.filename}
                      loading="lazy"
                      className="h-24 w-full rounded object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded bg-card">
                    {isImg ? (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    ) : (
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                )}
                <p className="mt-1 truncate text-[11px]">{a.filename}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {formatBytes(a.file_size_bytes ?? 0)}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  {a.signed_url && (
                    <a
                      href={a.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="inline h-3 w-3" /> abrir
                    </a>
                  )}
                  <button
                    onClick={async () => {
                      if (!confirm("¿Eliminar adjunto?")) return;
                      try {
                        await deleteMut.mutateAsync({
                          id: a.id,
                          incident_id: incidentId,
                          storage_path: a.storage_path,
                        });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "error");
                      }
                    }}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="inline h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
        >
          <img src={previewUrl} alt="preview" className="max-h-[90vh] max-w-full" />
        </div>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Plus, Sparkles, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useProperties } from "@/lib/operations";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  SEVERITY_BADGE,
  STATUS_BADGE,
  incidentSchema,
  useAssetsForProperty,
  useCreateIncident,
  useFindSimilarIncidents,
  useIncidents,
  type IncidentFilters,
  type IncidentFormValues,
  type IncidentListItem,
  type IncidentSeverity,
  type IncidentStatus,
  type SimilarIncident,
} from "@/lib/maintenance";
import { IncidentDetailSheet } from "@/components/operations/IncidentDetailSheet";

export const Route = createFileRoute("/_authenticated/operations/maintenance")({
  component: MaintenancePage,
});

function nowLocalIso() {
  const d = new Date();
  d.setMilliseconds(0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function emptyIncident(propertyId: string | null): IncidentFormValues {
  return {
    property_id: propertyId ?? "",
    asset_id: null,
    title: "",
    description: "",
    severity: "low",
    status: "open",
    occurred_at: new Date().toISOString(),
    vendor_contact_id: null,
    cost_amount: null,
    cost_currency: "USD",
    resolution_notes: null,
    resolved_at: null,
  };
}

function MaintenancePage() {
  const { t } = useI18n();
  const propertiesQ = useProperties();
  const [propertyId, setPropertyId] = useState<string | null>(null);

  // First property fallback
  const effectiveProperty =
    propertyId ?? (propertiesQ.data && propertiesQ.data[0]?.id) ?? null;

  // Filters
  const [statuses, setStatuses] = useState<IncidentStatus[]>([
    "open",
    "diagnosing",
    "in_progress",
  ]);
  const [severities, setSeverities] = useState<IncidentSeverity[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters: IncidentFilters = useMemo(
    () => ({
      property_id: effectiveProperty,
      statuses: statuses.length ? statuses : undefined,
      severities: severities.length ? severities : undefined,
      asset_ids: assetIds.length ? assetIds : undefined,
      search: search.trim() || undefined,
      from: from || null,
      to: to || null,
    }),
    [effectiveProperty, statuses, severities, assetIds, search, from, to],
  );

  const incidentsQ = useIncidents(filters);
  const assetsQ = useAssetsForProperty(effectiveProperty);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => incidentsQ.data?.find((i) => i.id === selectedId) ?? null,
    [incidentsQ.data, selectedId],
  );

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Operations · {t("maintenance.title")}</h1>
          <p className="label-mono">{incidentsQ.data?.length ?? 0} rows</p>
        </div>
        <Select
          value={effectiveProperty ?? ""}
          onValueChange={(v) => {
            setPropertyId(v);
            setSelectedId(null);
            setAssetIds([]);
          }}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Property" />
          </SelectTrigger>
          <SelectContent>
            {propertiesQ.data?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr_420px]">
        {/* LEFT — filters */}
        <Card className="h-fit p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </div>

          <div className="space-y-3">
            <div>
              <p className="label-mono mb-1">Search</p>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="title / description"
                className="h-8"
              />
            </div>

            <div>
              <p className="label-mono mb-1">Status</p>
              <div className="flex flex-wrap gap-1">
                {INCIDENT_STATUSES.map((s) => {
                  const active = statuses.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setStatuses((prev) =>
                          prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                        )
                      }
                      className={`rounded border px-1.5 py-0.5 text-[10px] ${
                        active ? STATUS_BADGE[s] : "border-border text-muted-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="label-mono mb-1">Severity</p>
              <div className="flex flex-wrap gap-1">
                {INCIDENT_SEVERITIES.map((s) => {
                  const active = severities.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setSeverities((prev) =>
                          prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                        )
                      }
                      className={`rounded border px-1.5 py-0.5 text-[10px] ${
                        active ? SEVERITY_BADGE[s] : "border-border text-muted-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="label-mono mb-1">Asset</p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {assetsQ.data?.map((a) => {
                  const active = assetIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex items-center gap-1.5 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() =>
                          setAssetIds((prev) =>
                            prev.includes(a.id)
                              ? prev.filter((x) => x !== a.id)
                              : [...prev, a.id],
                          )
                        }
                      />
                      <span className="truncate">{a.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="label-mono mb-1">From</p>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <p className="label-mono mb-1">To</p>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setStatuses(["open", "diagnosing", "in_progress"]);
                setSeverities([]);
                setAssetIds([]);
                setSearch("");
                setFrom("");
                setTo("");
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </Card>

        {/* MIDDLE — list */}
        <Card className="overflow-hidden">
          {incidentsQ.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : !incidentsQ.data || incidentsQ.data.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t("maintenance.empty")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {incidentsQ.data.map((inc) => (
                <IncidentRow
                  key={inc.id}
                  incident={inc}
                  selected={selectedId === inc.id}
                  onClick={() => setSelectedId(inc.id)}
                />
              ))}
            </ul>
          )}
        </Card>

        {/* RIGHT — actions panel */}
        <div className="space-y-3">
          <NewIncidentPanel propertyId={effectiveProperty} />
        </div>
      </div>

      <IncidentDetailSheet
        incident={selected}
        open={!!selected}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function IncidentRow({
  incident,
  selected,
  onClick,
}: {
  incident: IncidentListItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li
      onClick={onClick}
      className={`cursor-pointer px-3 py-2.5 transition-colors ${
        selected ? "bg-card-elevated" : "hover:bg-card-elevated/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{incident.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {incident.description}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
            <span className={`rounded border px-1.5 py-0.5 ${STATUS_BADGE[incident.status]}`}>
              {incident.status}
            </span>
            <span
              className={`rounded border px-1.5 py-0.5 ${SEVERITY_BADGE[incident.severity]}`}
            >
              {incident.severity}
            </span>
            {incident.asset && (
              <span className="text-muted-foreground">{incident.asset.name}</span>
            )}
            {incident.agent_action_status && (
              <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-accent">
                action: {incident.agent_action_status}
              </span>
            )}
            {incident.embedding == null && (
              <span className="text-muted-foreground">embed pending</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-[10px] text-muted-foreground">
          {incident.occurred_at?.slice(0, 10)}
        </div>
      </div>
    </li>
  );
}

function NewIncidentPanel({ propertyId }: { propertyId: string | null }) {
  const { t } = useI18n();
  const [form, setForm] = useState<IncidentFormValues>(emptyIncident(propertyId));
  const [occurredLocal, setOccurredLocal] = useState(nowLocalIso());
  const assetsQ = useAssetsForProperty(propertyId);
  const createMut = useCreateIncident();
  const similarMut = useFindSimilarIncidents();
  const [similar, setSimilar] = useState<SimilarIncident[] | null>(null);

  // Reset asset when property changes
  if (form.property_id !== (propertyId ?? "")) {
    setForm((f) => ({ ...f, property_id: propertyId ?? "", asset_id: null }));
    setSimilar(null);
  }

  const canSearch = form.title.trim().length + form.description.trim().length >= 5;

  const onSearchSimilar = async () => {
    if (!propertyId) {
      toast.error("Selecciona una propiedad");
      return;
    }
    try {
      const text = `${form.title}\n\n${form.description}`.trim();
      const res = await similarMut.mutateAsync({
        text,
        property_id: propertyId,
        limit: 5,
      });
      setSimilar(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Embedding search failed");
    }
  };

  const onSave = async () => {
    if (!propertyId) {
      toast.error("Selecciona una propiedad");
      return;
    }
    const occurred = new Date(occurredLocal).toISOString();
    const parsed = incidentSchema.safeParse({
      ...form,
      property_id: propertyId,
      occurred_at: occurred,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Validación falló");
      return;
    }
    try {
      const inc = await createMut.mutateAsync(parsed.data);
      toast.success(t("maintenance.embeddingIndexing"));
      if (inc.severity === "high" || inc.severity === "critical") {
        toast.success(t("maintenance.autoTaskCreated"));
      }
      // Reset form (keep property)
      setForm(emptyIncident(propertyId));
      setOccurredLocal(nowLocalIso());
      setSimilar(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "error");
    }
  };

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Plus className="h-3.5 w-3.5" />
        {t("maintenance.newIncident")}
      </div>

      <div className="space-y-2">
        <div>
          <p className="label-mono mb-1">Title *</p>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={200}
            className="h-8"
          />
        </div>

        <div>
          <p className="label-mono mb-1">Description *</p>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={5000}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="label-mono mb-1">Severity</p>
            <Select
              value={form.severity}
              onValueChange={(v) =>
                setForm({ ...form, severity: v as IncidentSeverity })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="label-mono mb-1">Asset</p>
            <Select
              value={form.asset_id ?? "__none"}
              onValueChange={(v) =>
                setForm({ ...form, asset_id: v === "__none" ? null : v })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Sin asset —</SelectItem>
                {assetsQ.data?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <p className="label-mono mb-1">Occurred at</p>
          <Input
            type="datetime-local"
            value={occurredLocal}
            onChange={(e) => setOccurredLocal(e.target.value)}
            className="h-8"
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!canSearch || similarMut.isPending}
            onClick={onSearchSimilar}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {similar === null
              ? t("maintenance.searchSimilar")
              : t("maintenance.searchSimilarAgain")}
            {similarMut.isPending && "…"}
          </Button>

          {similar !== null && (
            <div className="mt-1 rounded border border-border bg-muted/30 p-2">
              {similar.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("maintenance.noSimilar")}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {similar.map((s) => (
                    <li key={s.id} className="text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{s.title}</span>
                        <span className="shrink-0 font-mono text-muted-foreground">
                          {(s.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                      {s.resolution_notes && (
                        <p className="mt-0.5 text-muted-foreground line-clamp-2">
                          ✓ {s.resolution_notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onSave}
              disabled={createMut.isPending}
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {createMut.isPending ? "Saving…" : "Crear incidente"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={createMut.isPending}
              onClick={() => {
                setForm(emptyIncident(propertyId));
                setOccurredLocal(nowLocalIso());
                setSimilar(null);
              }}
            >
              {t("maintenance.cancel")}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

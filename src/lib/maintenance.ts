/**
 * Maintenance Memory — shared queries, mutations, schemas.
 *
 * Sprint 3.2 Phase B.
 * Etapa 1: assets CRUD implementado. Etapas 2-4: stubs con `throw new Error('Not yet implemented')`.
 * La API pública queda estable para que Etapas 2/3/4 solo implementen los handlers.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ASSET_CATEGORIES = [
  "hvac",
  "appliance",
  "security",
  "plumbing",
  "electrical",
  "furniture",
  "other",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  "open",
  "diagnosing",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_OPEN_STATUSES: IncidentStatus[] = ["open", "diagnosing", "in_progress"];

/** Allowed transitions per current status (used by the detail sheet). */
export const INCIDENT_STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["diagnosing", "resolved", "closed"],
  diagnosing: ["in_progress", "resolved", "closed"],
  in_progress: ["resolved", "diagnosing", "closed"],
  resolved: ["closed", "open"],
  closed: ["open"],
};

export const ATTACHMENT_BUCKET = "incident-attachments";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const ATTACHMENT_ACCEPT = "image/*";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const assetSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(50),
  brand: z.string().max(100).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  serial_number: z.string().max(100).nullable().optional(),
  purchase_date: z.string().nullable().optional(),
  warranty_expires_at: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type AssetFormValues = z.infer<typeof assetSchema>;

export const incidentSchema = z.object({
  property_id: z.string().uuid(),
  asset_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  severity: z.enum(INCIDENT_SEVERITIES),
  status: z.enum(INCIDENT_STATUSES).default("open"),
  occurred_at: z.string(),
  vendor_contact_id: z.string().uuid().nullable().optional(),
  cost_amount: z.number().nullable().optional(),
  cost_currency: z.string().max(8).nullable().optional(),
  resolution_notes: z.string().max(5000).nullable().optional(),
  resolved_at: z.string().nullable().optional(),
});
export type IncidentFormValues = z.infer<typeof incidentSchema>;

export const resolveIncidentSchema = z.object({
  resolution_notes: z.string().min(10).max(5000),
  vendor_contact_id: z.string().uuid().nullable().optional(),
  cost_amount: z.number().nullable().optional(),
  cost_currency: z.string().max(8).default("USD"),
  resolved_at: z.string(),
});
export type ResolveIncidentValues = z.infer<typeof resolveIncidentSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Asset = {
  id: string;
  user_id: string;
  property_id: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  warranty_expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AssetWithCounts = Asset & {
  incidents_count: number;
  open_incidents_count: number;
};

export type MaintenanceIncident = {
  id: string;
  user_id: string;
  property_id: string;
  asset_id: string | null;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurred_at: string;
  resolved_at: string | null;
  cost_amount: number | null;
  cost_currency: string | null;
  vendor_contact_id: string | null;
  resolution_notes: string | null;
  agent_action_id: string | null;
  embedding: unknown | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type IncidentListItem = MaintenanceIncident & {
  asset: { id: string; name: string; category: string | null } | null;
  vendor: { id: string; name: string } | null;
  attachments_count: number;
  agent_action_status: string | null;
};

export type IncidentAttachment = {
  id: string;
  incident_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  caption: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type SimilarIncident = {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurred_at: string;
  resolution_notes: string | null;
  asset_id: string | null;
  similarity: number;
};

export type IncidentFilters = {
  property_id: string | null;
  asset_ids?: string[];
  statuses?: IncidentStatus[];
  severities?: IncidentSeverity[];
  from?: string | null;
  to?: string | null;
  search?: string;
  no_asset?: boolean;
};

// ---------------------------------------------------------------------------
// ASSETS — implemented (Etapa 1)
// ---------------------------------------------------------------------------

export function useAssetsForProperty(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["assets", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Asset[];
    },
  });
}

/** Same as useAssetsForProperty but also computes incident counts per asset. */
export function useAssetsWithCounts(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["assets_with_counts", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data: assets, error } = await supabase
        .from("assets")
        .select("*")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      const list = (assets ?? []) as Asset[];
      if (list.length === 0) return [] as AssetWithCounts[];

      const ids = list.map((a) => a.id);
      const { data: incidents, error: incErr } = await supabase
        .from("maintenance_incidents")
        .select("asset_id, status")
        .in("asset_id", ids)
        .is("deleted_at", null);
      if (incErr) throw incErr;

      const counts = new Map<string, { total: number; open: number }>();
      for (const inc of incidents ?? []) {
        const k = (inc as { asset_id: string }).asset_id;
        const c = counts.get(k) ?? { total: 0, open: 0 };
        c.total += 1;
        if (
          INCIDENT_OPEN_STATUSES.includes(
            (inc as { status: IncidentStatus }).status,
          )
        ) {
          c.open += 1;
        }
        counts.set(k, c);
      }
      return list.map<AssetWithCounts>((a) => ({
        ...a,
        incidents_count: counts.get(a.id)?.total ?? 0,
        open_incidents_count: counts.get(a.id)?.open ?? 0,
      }));
    },
  });
}

export function useCreateAsset(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: AssetFormValues) => {
      if (!propertyId) throw new Error("propertyId required");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("not authenticated");
      const payload = {
        ...values,
        property_id: propertyId,
        user_id: uid,
        brand: values.brand || null,
        model: values.model || null,
        serial_number: values.serial_number || null,
        purchase_date: values.purchase_date || null,
        warranty_expires_at: values.warranty_expires_at || null,
        notes: values.notes || null,
      };
      const { data, error } = await supabase
        .from("assets")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as Asset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets", propertyId] });
      qc.invalidateQueries({ queryKey: ["assets_with_counts", propertyId] });
    },
  });
}

export function useUpdateAsset(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; values: Partial<AssetFormValues> }) => {
      const patch = {
        ...input.values,
        brand: input.values.brand || null,
        model: input.values.model || null,
        serial_number: input.values.serial_number || null,
        purchase_date: input.values.purchase_date || null,
        warranty_expires_at: input.values.warranty_expires_at || null,
        notes: input.values.notes || null,
      };
      const { data, error } = await supabase
        .from("assets")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data as Asset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets", propertyId] });
      qc.invalidateQueries({ queryKey: ["assets_with_counts", propertyId] });
    },
  });
}

export function useSoftDeleteAsset(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      const { error } = await supabase
        .from("assets")
        .update({ deleted_at: new Date().toISOString(), deleted_by: uid })
        .eq("id", id);
      if (error) throw error;
      return { id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets", propertyId] });
      qc.invalidateQueries({ queryKey: ["assets_with_counts", propertyId] });
    },
  });
}

// ---------------------------------------------------------------------------
// INCIDENTS — Etapa 2/3 stubs
// ---------------------------------------------------------------------------

export function useIncidents(_filters: IncidentFilters) {
  return useQuery({
    queryKey: ["maintenance_incidents", _filters],
    enabled: false,
    queryFn: async (): Promise<IncidentListItem[]> => {
      throw new Error("useIncidents: Not yet implemented (Etapa 2)");
    },
  });
}

export function useIncident(_id: string | null | undefined) {
  return useQuery({
    queryKey: ["maintenance_incident", _id],
    enabled: false,
    queryFn: async (): Promise<MaintenanceIncident | null> => {
      throw new Error("useIncident: Not yet implemented (Etapa 3)");
    },
  });
}

export function useIncidentTimeline(_id: string | null | undefined) {
  return useQuery({
    queryKey: ["maintenance_incident_timeline", _id],
    enabled: false,
    queryFn: async () => {
      throw new Error("useIncidentTimeline: Not yet implemented (Etapa 3)");
    },
  });
}

export function useCreateIncident() {
  return useMutation({
    mutationFn: async (_values: IncidentFormValues): Promise<MaintenanceIncident> => {
      throw new Error("useCreateIncident: Not yet implemented (Etapa 2)");
    },
  });
}

export function useUpdateIncident() {
  return useMutation({
    mutationFn: async (_input: {
      id: string;
      values: Partial<IncidentFormValues>;
    }): Promise<MaintenanceIncident> => {
      throw new Error("useUpdateIncident: Not yet implemented (Etapa 3)");
    },
  });
}

export function useSoftDeleteIncident() {
  return useMutation({
    mutationFn: async (_id: string) => {
      throw new Error("useSoftDeleteIncident: Not yet implemented (Etapa 3)");
    },
  });
}

export function useResolveIncident() {
  return useMutation({
    mutationFn: async (_input: { id: string; values: ResolveIncidentValues }) => {
      throw new Error("useResolveIncident: Not yet implemented (Etapa 3)");
    },
  });
}

export function useTransitionIncidentStatus() {
  return useMutation({
    mutationFn: async (_input: { id: string; to: IncidentStatus }) => {
      throw new Error("useTransitionIncidentStatus: Not yet implemented (Etapa 3)");
    },
  });
}

// ---------------------------------------------------------------------------
// EMBEDDINGS / SEMANTIC SEARCH — Etapa 2 stubs
// ---------------------------------------------------------------------------

export function useFindSimilarIncidents() {
  return useMutation({
    mutationFn: async (_input: {
      text: string;
      property_id: string;
      limit?: number;
    }): Promise<SimilarIncident[]> => {
      throw new Error("useFindSimilarIncidents: Not yet implemented (Etapa 2)");
    },
  });
}

export function useRegenerateEmbedding() {
  return useMutation({
    mutationFn: async (_input: { incident_id: string; text: string }) => {
      throw new Error("useRegenerateEmbedding: Not yet implemented (Etapa 3)");
    },
  });
}

// ---------------------------------------------------------------------------
// ATTACHMENTS — Etapa 3 stubs
// ---------------------------------------------------------------------------

export function useIncidentAttachments(_incidentId: string | null | undefined) {
  return useQuery({
    queryKey: ["incident_attachments", _incidentId],
    enabled: false,
    queryFn: async (): Promise<Array<IncidentAttachment & { signed_url: string | null }>> => {
      throw new Error("useIncidentAttachments: Not yet implemented (Etapa 3)");
    },
  });
}

export function useUploadIncidentAttachment() {
  return useMutation({
    mutationFn: async (_input: {
      incident_id: string;
      file: File;
      caption?: string;
    }): Promise<IncidentAttachment> => {
      throw new Error("useUploadIncidentAttachment: Not yet implemented (Etapa 3)");
    },
  });
}

export function useDeleteIncidentAttachment() {
  return useMutation({
    mutationFn: async (_input: { id: string; storage_path: string }) => {
      throw new Error("useDeleteIncidentAttachment: Not yet implemented (Etapa 3)");
    },
  });
}

// ---------------------------------------------------------------------------
// AGENT — failed actions widget (Etapa 4)
// ---------------------------------------------------------------------------

export function useFailedActions(_windowDays = 7) {
  return useQuery({
    queryKey: ["agent_actions_failed", _windowDays],
    enabled: false,
    queryFn: async () => {
      throw new Error("useFailedActions: Not yet implemented (Etapa 4)");
    },
  });
}

export function useRetryFailedAction() {
  return useMutation({
    mutationFn: async (_id: string) => {
      throw new Error("useRetryFailedAction: Not yet implemented (Etapa 4)");
    },
  });
}

export function useAcknowledgeFailedAction() {
  return useMutation({
    mutationFn: async (_id: string) => {
      throw new Error("useAcknowledgeFailedAction: Not yet implemented (Etapa 4)");
    },
  });
}

// ---------------------------------------------------------------------------
// Visual helpers (UI-only, safe to use in any etapa)
// ---------------------------------------------------------------------------

export const ASSET_CATEGORY_BADGE: Record<string, string> = {
  hvac: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  appliance: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  security: "bg-red-500/15 text-red-400 border-red-500/30",
  plumbing: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  electrical: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  furniture: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  other: "bg-muted text-muted-foreground border-border",
};

export const SEVERITY_BADGE: Record<IncidentSeverity, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const STATUS_BADGE: Record<IncidentStatus, string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  diagnosing: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  in_progress: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  resolved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

export function warrantyState(date: string | null): {
  label: string | null;
  tone: "ok" | "soon" | "expired" | null;
} {
  if (!date) return { label: null, tone: null };
  const now = new Date();
  const exp = new Date(date);
  const diffDays = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: "Vencida", tone: "expired" };
  if (diffDays < 30) return { label: `Vence en ${diffDays}d`, tone: "soon" };
  return { label: null, tone: "ok" };
}

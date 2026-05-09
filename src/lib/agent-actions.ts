import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Agent Actions: client-side helpers que usan el browser supabase client.
// RLS (auth.uid() = user_id) protege lectura y escritura.
// El executor (RPC execute_agent_action) escribe a `events` para auditoría.
// ============================================================================

type Json = Record<string, any>;

// ---------- Zod payload schemas (one per action_type) ----------

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date string");

export const createTaskPayload = z.object({
  mission_id: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  notes: z.string().optional(),
  due_date: dateString.optional(),
  is_today: z.boolean().optional(),
  effort_minutes: z.number().int().positive().optional(),
  friction_level: z.number().int().min(1).max(3).optional(),
});

export const createMissionPayload = z.object({
  area_id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(["low", "mid", "high"]).optional(),
  due_date: dateString.optional(),
  reward_text: z.string().optional(),
});

export const createReservationPayload = z.object({
  property_id: z.string().uuid(),
  source: z.enum(["airbnb", "vrbo", "booking", "direct", "manual", "email_detected"]),
  confirmation_code: z.string().optional(),
  guest_name: z.string().optional(),
  guest_email: z.string().email().optional(),
  guest_phone: z.string().optional(),
  check_in_date: dateString,
  check_out_date: dateString,
  check_in_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  check_out_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  number_of_guests: z.number().int().positive().optional(),
  payout_amount: z.number().optional(),
  cleaning_fee: z.number().optional(),
  taxes_or_fees: z.number().optional(),
  status: z.string().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

export const updateTaskPayload = z
  .object({
    task_id: z.string().uuid(),
    title: z.string().trim().min(1).max(500).optional(),
    notes: z.string().optional(),
    status: z.enum(["todo", "doing", "done", "blocked"]).optional(),
    due_date: dateString.optional(),
    is_today: z.boolean().optional(),
    friction_level: z.number().int().min(1).max(3).optional(),
  })
  .refine(
    (u) =>
      Object.keys(u).filter((k) => k !== "task_id" && (u as any)[k] !== undefined).length > 0,
    { message: "update_task requires at least one field besides task_id" },
  );

export const cancelReservationPayload = z.object({
  reservation_id: z.string().uuid(),
  cancelled_by: z.enum(["host", "guest", "platform", "unknown"]).default("unknown"),
  cancellation_email_id: z.string().optional().nullable(),
  confirmation_code: z.string().optional(),
});

const UPDATE_RESERVATION_FIELDS = [
  "check_in_date", "check_out_date", "check_in_time", "check_out_time",
  "guest_name", "guest_email", "guest_phone", "number_of_guests",
  "payout_amount", "cleaning_fee", "taxes_or_fees",
] as const;

export const updateReservationPayload = z.object({
  reservation_id: z.string().uuid(),
  updates: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .refine(
      (u) => Object.keys(u).length > 0,
      { message: "updates must be non-empty" },
    )
    .refine(
      (u) => Object.keys(u).every((k) => (UPDATE_RESERVATION_FIELDS as readonly string[]).includes(k)),
      { message: `updates may only contain: ${UPDATE_RESERVATION_FIELDS.join(", ")}` },
    ),
  recalc_task_dates: z.boolean(),
  confirmation_code: z.string().optional(),
});

export const PAYLOAD_SCHEMAS = {
  create_task: createTaskPayload,
  create_mission: createMissionPayload,
  create_reservation: createReservationPayload,
  update_task: updateTaskPayload,
  cancel_reservation: cancelReservationPayload,
  update_reservation: updateReservationPayload,
} as const;

export type AgentActionType = keyof typeof PAYLOAD_SCHEMAS;

function validatePayload(actionType: string, payload: unknown) {
  const schema = (PAYLOAD_SCHEMAS as Record<string, z.ZodTypeAny>)[actionType];
  if (!schema) {
    throw new Error(`Unsupported action_type: ${actionType}`);
  }
  const parsed = schema.safeParse(payload ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid payload for ${actionType}: ${issues}`);
  }
  return parsed.data;
}

// ---------- Auth helper ----------

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

// ---------- Public API ----------

export async function listAgentActions(filter?: { status?: string }) {
  let q = supabase
    .from("agent_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) {
    console.error("[agent-actions] list failed", error);
    throw error;
  }
  return data ?? [];
}

export async function proposeAgentAction(input: {
  source_type?: string;
  source_ref?: string;
  agent_name?: string;
  action_type: string;
  payload?: Json;
  confidence_score?: number;
  requires_approval?: boolean;
  idempotency_key?: string;
  group_key?: string;
}) {
  // Validate + normalize payload before any DB call. Throws on invalid.
  const cleanPayload = validatePayload(input.action_type, input.payload ?? {});

  const userId = await currentUserId();
  const row = {
    user_id: userId,
    source_type: input.source_type ?? "manual",
    source_ref: input.source_ref ?? null,
    agent_name: input.agent_name ?? null,
    action_type: input.action_type,
    payload: cleanPayload,
    confidence_score: input.confidence_score ?? null,
    requires_approval: input.requires_approval ?? true,
    idempotency_key: input.idempotency_key ?? null,
    group_key: input.group_key ?? null,
    status: "proposed",
  };
  const { data, error } = await supabase
    .from("agent_actions")
    .insert(row as any)
    .select()
    .single();
  if (error) {
    console.error("[agent-actions] propose failed", error, row);
    throw error;
  }
  return data;
}

export async function rejectAgentAction(id: string) {
  const { error } = await supabase
    .from("agent_actions")
    .update({ status: "rejected" })
    .eq("id", id);
  if (error) {
    console.error("[agent-actions] reject failed", error);
    throw error;
  }
  return { ok: true };
}

export async function executeAgentAction(id: string) {
  const { data, error } = await supabase.rpc("execute_agent_action" as any, {
    _action_id: id,
  });
  if (error) {
    console.error("[agent-actions] rpc execute failed", { id, error });
    await supabase
      .from("agent_actions")
      .update({ status: "failed", error_message: error.message })
      .eq("id", id)
      .eq("status", "proposed");
    throw error;
  }
  return data as { ok: boolean; result?: Json; already?: boolean; duplicate?: boolean };
}

export async function listActiveMissions() {
  const { data, error } = await supabase
    .from("missions")
    .select("id, code, title, updated_at")
    .neq("status", "completed")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[agent-actions] listActiveMissions failed", error);
    throw error;
  }
  return data ?? [];
}

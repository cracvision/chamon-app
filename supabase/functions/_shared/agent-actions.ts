// ============================================================================
// Shared Deno-side helper for enqueuing agent_actions.
// Mirrors src/lib/agent-actions.ts (frontend) — keep schemas in sync.
//
// All inserts into public.agent_actions from edge functions MUST go through
// `enqueueAgentAction()` so payloads are validated with Zod before hitting
// the DB. Otherwise a malformed payload only fails when the executor branch
// runs (i.e. when Carlos approves in /agent), not at enqueue time.
// ============================================================================

import { z } from "https://esm.sh/zod@3.23.8";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

// ---- Per-action_type payload schemas ----
// Shapes inferred from execute_agent_action() / execute-calendar-action edge fn.

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
  number_of_guests: z.number().int().positive().optional(),
  payout_amount: z.number().optional(),
  cleaning_fee: z.number().optional(),
  taxes_or_fees: z.number().optional(),
  status: z.string().optional(),
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
      Object.keys(u).filter((k) => k !== "task_id" && (u as Record<string, unknown>)[k] !== undefined).length > 0,
    { message: "update_task requires at least one field besides task_id" },
  );

// create_reservation_with_mission — property_id at ROOT (not nested).
// reservation must have source, confirmation_code, check_in_date, check_out_date.
// mission must have template_id and title.
const reservationSubobject = z.object({
  source: z.enum(["airbnb", "vrbo", "booking", "direct", "manual", "email_detected"]),
  confirmation_code: z.string().min(1),
  guest_name: z.string().optional().nullable(),
  guest_email: z.string().email().optional().nullable(),
  guest_phone: z.string().optional().nullable(),
  check_in_date: dateString,
  check_out_date: dateString,
  check_in_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  check_out_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  number_of_guests: z.number().int().positive().optional().nullable(),
  payout_amount: z.number().optional().nullable(),
  cleaning_fee: z.number().optional().nullable(),
  taxes_or_fees: z.number().optional().nullable(),
  source_email_ids: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});

const missionSubobject = z.object({
  template_id: z.string().uuid(),
  title: z.string().min(1),
  area_id: z.string().uuid().optional().nullable(),
});

export const createReservationWithMissionPayload = z.object({
  property_id: z.string().uuid(),
  reservation: reservationSubobject,
  mission: missionSubobject,
});

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
    .refine((u) => Object.keys(u).length > 0, { message: "updates must be non-empty" })
    .refine(
      (u) => Object.keys(u).every((k) => (UPDATE_RESERVATION_FIELDS as readonly string[]).includes(k)),
      { message: `updates may only contain: ${UPDATE_RESERVATION_FIELDS.join(", ")}` },
    ),
  recalc_task_dates: z.boolean(),
  confirmation_code: z.string().optional(),
});

export const createCalendarEventPayload = z
  .object({
    reservation_id: z.string().uuid().optional(),
    pending_reservation_confirmation_code: z.string().optional(),
    pending_check_in_date: dateString.optional(),
    confirmation_code: z.string().optional(),
  })
  .refine(
    (p) =>
      !!p.reservation_id ||
      (!!p.pending_reservation_confirmation_code && !!p.pending_check_in_date),
    { message: "create_calendar_event requires reservation_id OR (pending_reservation_confirmation_code + pending_check_in_date)" },
  );

export const updateCalendarEventPayload = z.object({
  reservation_id: z.string().uuid(),
  confirmation_code: z.string().optional(),
});

export const deleteCalendarEventPayload = z.object({
  reservation_id: z.string().uuid(),
  confirmation_code: z.string().optional(),
});

// --- Cleaning Coordinator (Sprint 3.1) ---

export const notifyVendorCleaningPayload = z.object({
  task_id: z.string().uuid(),
  vendor_contact_id: z.string().uuid(),
  property_id: z.string().uuid().optional().nullable(),
  reservation_confirmation_code: z.string().optional().nullable(),
  service_type: z.enum(["pre_checkin", "post_checkout"]),
  service_date: dateString,
  guest_checkin_date: dateString,
});

export const markVendorConfirmedPayload = z.object({
  task_id: z.string().uuid(),
  confirmed_via: z.enum(["manual", "whatsapp", "email", "sms"]).optional(),
  vendor_message: z.string().optional(),
});

export const escalateVendorNoResponsePayload = z.object({
  task_id: z.string().uuid(),
  hours_until_checkin: z.number().int().min(0).optional(),
  reason: z.enum(["no_response", "never_notified"]).optional(),
});

// --- Maintenance Memory (Sprint 3.2) ---
export const createMaintenanceTaskPayload = z.object({
  incident_id: z.string().uuid(),
  property_id: z.string().uuid(),
  asset_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  severity: z.enum(["high", "critical"]),
  description: z.string().max(5000),
});

export const PAYLOAD_SCHEMAS = {
  create_task: createTaskPayload,
  create_mission: createMissionPayload,
  create_reservation: createReservationPayload,
  update_task: updateTaskPayload,
  create_reservation_with_mission: createReservationWithMissionPayload,
  cancel_reservation: cancelReservationPayload,
  update_reservation: updateReservationPayload,
  create_calendar_event: createCalendarEventPayload,
  update_calendar_event: updateCalendarEventPayload,
  delete_calendar_event: deleteCalendarEventPayload,
  notify_vendor_cleaning: notifyVendorCleaningPayload,
  mark_vendor_confirmed: markVendorConfirmedPayload,
  escalate_vendor_no_response: escalateVendorNoResponsePayload,
  create_maintenance_task: createMaintenanceTaskPayload,
} as const;

export type AgentActionType = keyof typeof PAYLOAD_SCHEMAS;

export type EnqueueAgentActionInput = {
  user_id: string;
  action_type: AgentActionType | string;
  payload: unknown;
  idempotency_key: string;
  group_key?: string | null;
  requires_approval?: boolean;
  source_type?: string;
  source_ref?: string | null;
  agent_name?: string | null;
  confidence_score?: number | null;
};

export type EnqueueResult =
  | { ok: true; action_id: string; duplicate: boolean; existing_status?: string | null }
  | { ok: false; error: string; issues?: unknown };

// deno-lint-ignore no-explicit-any
export async function enqueueAgentAction(
  supabase: any,
  input: EnqueueAgentActionInput,
): Promise<EnqueueResult> {
  const schema = (PAYLOAD_SCHEMAS as Record<string, z.ZodTypeAny>)[input.action_type];
  if (!schema) {
    return { ok: false, error: `unknown action_type: ${input.action_type}` };
  }
  const parsed = schema.safeParse(input.payload ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `invalid_payload: ${msg}`, issues: parsed.error.issues };
  }

  const row = {
    user_id: input.user_id,
    source_type: input.source_type ?? "system",
    source_ref: input.source_ref ?? null,
    agent_name: input.agent_name ?? null,
    action_type: input.action_type,
    payload: parsed.data,
    confidence_score: input.confidence_score ?? null,
    requires_approval: input.requires_approval ?? true,
    idempotency_key: input.idempotency_key,
    group_key: input.group_key ?? null,
    status: "proposed",
  };

  const { data, error } = await supabase
    .from("agent_actions")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      const { data: dup } = await supabase
        .from("agent_actions")
        .select("id, status")
        .eq("user_id", input.user_id)
        .eq("idempotency_key", input.idempotency_key)
        .maybeSingle();
      if (dup?.id) {
        return { ok: true, action_id: dup.id, duplicate: true, existing_status: dup.status ?? null };
      }
      return { ok: false, error: "duplicate_idempotency_key_but_lookup_failed" };
    }
    return { ok: false, error: error.message ?? "insert_failed" };
  }

  if (!data?.id) return { ok: false, error: "insert_returned_no_id" };
  return { ok: true, action_id: data.id, duplicate: false };
}

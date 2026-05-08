import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================================
// Agent Actions: server functions for proposing, approving, executing, and
// rejecting actions in the supervised agent queue.
// All execution writes an audit row to public.events.
// ============================================================================

type Json = Record<string, unknown>;

const idSchema = z.object({ id: z.string().uuid() });

// ---------- LIST ----------
export const listAgentActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: string } | undefined) => data ?? {})
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let q = supabase
      .from("agent_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ---------- PROPOSE (manual / debug) ----------
const proposeSchema = z.object({
  source_type: z.string().default("manual"),
  source_ref: z.string().optional(),
  agent_name: z.string().optional(),
  action_type: z.string(),
  payload: z.record(z.string(), z.any()).default({}),
  confidence_score: z.number().min(0).max(1).optional(),
  requires_approval: z.boolean().default(true),
  idempotency_key: z.string().optional(),
  group_key: z.string().optional(),
});

export const proposeAgentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => proposeSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("agent_actions")
      .insert({ ...data, user_id: userId, status: "proposed" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

// ---------- REJECT ----------
export const rejectAgentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("agent_actions")
      .update({ status: "rejected" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- EXECUTE ----------
async function executePayload(
  supabase: any,
  userId: string,
  action: { id: string; action_type: string; payload: Json },
): Promise<Json> {
  const p = action.payload || {};
  switch (action.action_type) {
    case "create_task": {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          mission_id: p.mission_id,
          title: p.title,
          notes: p.notes ?? null,
          due_date: p.due_date ?? null,
          friction_level: p.friction_level ?? 2,
          is_today: p.is_today ?? false,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { task_id: data.id };
    }
    case "create_mission": {
      const { data, error } = await supabase
        .from("missions")
        .insert({
          user_id: userId,
          area_id: p.area_id ?? null,
          title: p.title,
          description: p.description ?? null,
          priority: p.priority ?? "mid",
          due_date: p.due_date ?? null,
          reward_text: p.reward_text ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { mission_id: data.id };
    }
    case "create_reservation": {
      const { data, error } = await supabase
        .from("reservations")
        .insert({
          user_id: userId,
          property_id: p.property_id ?? null,
          source: p.source ?? "manual",
          confirmation_code: p.confirmation_code ?? null,
          guest_name: p.guest_name ?? null,
          guest_email: p.guest_email ?? null,
          guest_phone: p.guest_phone ?? null,
          check_in_date: p.check_in_date ?? null,
          check_out_date: p.check_out_date ?? null,
          check_in_time: p.check_in_time ?? null,
          check_out_time: p.check_out_time ?? null,
          number_of_guests: p.number_of_guests ?? null,
          payout_amount: p.payout_amount ?? null,
          cleaning_fee: p.cleaning_fee ?? null,
          taxes_or_fees: p.taxes_or_fees ?? null,
          status: p.status ?? "confirmed",
          confidence_score: p.confidence_score ?? null,
          source_email_ids: p.source_email_ids ?? null,
          notes: p.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { reservation_id: data.id };
    }
    case "update_task": {
      const { task_id, ...rest } = p as any;
      if (!task_id) throw new Error("task_id required");
      const { error } = await supabase.from("tasks").update(rest).eq("id", task_id);
      if (error) throw error;
      return { task_id };
    }
    default:
      throw new Error(`Unsupported action_type: ${action.action_type}`);
  }
}

export const executeAgentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: action, error: fetchErr } = await supabase
      .from("agent_actions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    if (!action) throw new Error("Action not found");
    if (action.status === "executed") return { ok: true, already: true, result: action.result };

    try {
      const result = await executePayload(supabase, userId, {
        id: action.id,
        action_type: action.action_type,
        payload: (action.payload as Json) ?? {},
      });
      const { error: upErr } = await supabase
        .from("agent_actions")
        .update({
          status: "executed",
          result,
          executed_at: new Date().toISOString(),
          approved_at: action.approved_at ?? new Date().toISOString(),
          approved_by: action.approved_by ?? userId,
        })
        .eq("id", action.id);
      if (upErr) throw upErr;

      // Audit
      await supabase.from("events").insert({
        user_id: userId,
        entity_type: "agent_action",
        entity_id: action.id,
        action: "executed",
        metadata: {
          source: "agent_actions",
          action_type: action.action_type,
          confidence: action.confidence_score,
          result,
        },
      });
      return { ok: true, result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("agent_actions")
        .update({ status: "failed", error_message: msg })
        .eq("id", action.id);
      throw e;
    }
  });

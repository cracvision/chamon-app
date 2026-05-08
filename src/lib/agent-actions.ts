import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Agent Actions: client-side helpers que usan el browser supabase client.
// RLS (auth.uid() = user_id) protege lectura y escritura.
// El executor escribe a `events` para auditoría.
// ============================================================================

type Json = Record<string, any>;

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

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
  const userId = await currentUserId();
  const row = {
    user_id: userId,
    source_type: input.source_type ?? "manual",
    source_ref: input.source_ref ?? null,
    agent_name: input.agent_name ?? null,
    action_type: input.action_type,
    payload: input.payload ?? {},
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

async function executePayload(
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
        } as any)
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
        } as any)
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
        } as any)
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

export async function executeAgentAction(id: string) {
  const userId = await currentUserId();
  const { data: action, error: fetchErr } = await supabase
    .from("agent_actions")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) {
    console.error("[agent-actions] fetch failed", fetchErr);
    throw fetchErr;
  }
  if (!action) throw new Error("Action not found");
  if (action.status === "executed") {
    return { ok: true, already: true, result: action.result };
  }

  try {
    const result = await executePayload(userId, {
      id: action.id,
      action_type: action.action_type,
      payload: (action.payload as Json) ?? {},
    });
    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("agent_actions")
      .update({
        status: "executed",
        result,
        executed_at: nowIso,
        approved_at: action.approved_at ?? nowIso,
        approved_by: action.approved_by ?? userId,
      } as any)
      .eq("id", action.id);
    if (upErr) throw upErr;

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
      } as any,
    } as any);

    return { ok: true, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[agent-actions] execute failed", { id: action.id, msg, error: e });
    await supabase
      .from("agent_actions")
      .update({ status: "failed", error_message: msg })
      .eq("id", action.id);
    throw e;
  }
}

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

export async function executeAgentAction(id: string) {
  const { data, error } = await supabase.rpc("execute_agent_action" as any, {
    _action_id: id,
  });
  if (error) {
    console.error("[agent-actions] rpc execute failed", { id, error });
    // Best-effort mark failed, but only if still proposed (don't clobber executed/duplicate races)
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

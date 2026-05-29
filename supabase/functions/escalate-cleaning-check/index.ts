// escalate-cleaning-check — cron hourly.
// Calls enqueue_escalate_no_response RPC to insert agent_actions for tasks
// stuck in 'assigned' or 'notified' within 24h of check-in. Then immediately
// executes each via execute_escalate_action_service (service-role-friendly).
//
// Auth: Bearer (CHAMON_ELEVENLABS_BEARER).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, jsonResponse } from "../_shared/cors.ts";
import { verifyRequest } from "../_shared/auth.ts";

const HMAC_SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";
const BEARER_TOKEN = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? undefined;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const raw = await req.text();
  const auth = await verifyRequest(HMAC_SECRET, BEARER_TOKEN, req.headers, raw);
  if (!auth.ok) return jsonResponse({ error: auth.error }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Enqueue escalation actions.
  const { data: enqueued, error: enqErr } = await supabase.rpc("enqueue_escalate_no_response");
  if (enqErr) return jsonResponse({ error: "enqueue_failed", detail: enqErr.message }, 500);

  const rows = (enqueued ?? []) as Array<{ action_id: string; task_id: string; reason: string }>;
  const executed: Array<Record<string, unknown>> = [];

  for (const r of rows) {
    const { data: result, error } = await supabase.rpc("execute_escalate_action_service", {
      _action_id: r.action_id,
    });
    if (error) {
      console.error("[escalate-cleaning-check] execute failed:", r.action_id, error);
      executed.push({ action_id: r.action_id, ok: false, error: "internal_error" });
    } else {
      executed.push({ action_id: r.action_id, task_id: r.task_id, reason: r.reason, result });
    }
  }

  return jsonResponse({ ok: true, enqueued: rows.length, executed: executed.length, results: executed });
});

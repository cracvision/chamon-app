// dispatch-scheduled-actions — cron */10min.
// Picks notify_vendor_cleaning agent_actions whose scheduled_for <= now()
// and dispatches each one to cleaning-notify-vendor (which marks them executed).
// Idempotent: cleaning-notify-vendor short-circuits actions in 'executed' state.
//
// Auth: Bearer (CHAMON_ELEVENLABS_BEARER) — same pattern as gmail-sync-reservations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, jsonResponse } from "../_shared/cors.ts";
import { verifyRequest } from "../_shared/auth.ts";

const HMAC_SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";
const BEARER_TOKEN = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? undefined;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NOTIFY_URL = `${SUPABASE_URL}/functions/v1/cleaning-notify-vendor`;
const MAX_PER_RUN = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const raw = await req.text();
  const auth = await verifyRequest(HMAC_SECRET, BEARER_TOKEN, req.headers, raw);
  if (!auth.ok) return jsonResponse({ error: auth.error }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: due, error: pickErr } = await supabase.rpc("pick_scheduled_notify_actions", {
    _limit: MAX_PER_RUN,
  });
  if (pickErr) return jsonResponse({ error: "pick_failed", detail: pickErr.message }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const row of (due ?? []) as Array<{ action_id: string; user_id: string }>) {
    try {
      const r = await fetch(NOTIFY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${BEARER_TOKEN ?? ""}`,
        },
        body: JSON.stringify({ action_id: row.action_id }),
      });
      const text = await r.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch (_e) { json = { raw: text }; }
      results.push({ action_id: row.action_id, status: r.status, body: json });
    } catch (e) {
      results.push({ action_id: row.action_id, error: String(e) });
    }
  }

  return jsonResponse({ ok: true, picked: results.length, results });
});

// maintenance-embed
// Generates an embedding for a text via Lovable AI Gateway (openai/text-embedding-3-small, 1536 dims).
// If `incident_id` is provided, persists the embedding into maintenance_incidents (service-role + scoped WHERE user_id).
// Otherwise returns the embedding so the caller can pass it to find_similar_incidents.
//
// Auth: Bearer CHAMON_ELEVENLABS_BEARER (same shared bearer used by other internal cron/edge calls).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { CORS, jsonResponse } from "../_shared/cors.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBED_MODEL = "openai/text-embedding-3-small";

type Body = {
  text?: string;
  incident_id?: string;
  user_id?: string; // optional override; if absent we read user_id from the incident row
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  // Auth: accept (a) shared bearer for internal/cron use, (b) service-role key, or (c) a valid Supabase user JWT.
  const expectedBearer = Deno.env.get("CHAMON_ELEVENLABS_BEARER");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  let authedUserId: string | null = null;
  const incomingToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
  const isSharedBearer = !!expectedBearer && incomingToken === expectedBearer;
  const isServiceRole = !!serviceRoleKey && incomingToken === serviceRoleKey;
  console.log("[maintenance-embed] auth", {
    hasSharedBearer: !!expectedBearer,
    hasServiceRole: !!serviceRoleKey,
    incomingLen: incomingToken.length,
    isSharedBearer, isServiceRole,
  });
  if (!isSharedBearer && !isServiceRole) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !anonKey || !incomingToken) {
      return jsonResponse({ ok: false, error: "unauthorized", code: "AUTH" }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${incomingToken}` } },
      auth: { persistSession: false },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u?.user?.id) return jsonResponse({ ok: false, error: "unauthorized", code: "AUTH" }, 401);
    authedUserId = u.user.id;
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json", code: "BAD_BODY" }, 400);
  }
  const text = (body.text ?? "").trim();
  if (!text) return jsonResponse({ ok: false, error: "text_required", code: "BAD_BODY" }, 400);
  if (text.length > 8000) return jsonResponse({ ok: false, error: "text_too_long", code: "BAD_BODY" }, 400);

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return jsonResponse({ ok: false, error: "missing_LOVABLE_API_KEY", code: "CONFIG" }, 500);

  // Call gateway
  let embedding: number[];
  try {
    const r = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      const code = r.status === 429 ? "RATE_LIMIT" : r.status === 402 ? "NO_CREDITS" : "GATEWAY";
      return jsonResponse({ ok: false, error: `gateway_${r.status}`, code, detail: errBody.slice(0, 500) }, 502);
    }
    const data = await r.json();
    embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      return jsonResponse({ ok: false, error: "bad_embedding_shape", code: "GATEWAY", dims: embedding?.length ?? null }, 502);
    }
  } catch (e) {
    return jsonResponse({ ok: false, error: "gateway_fetch_failed", code: "NETWORK", detail: String(e).slice(0, 300) }, 502);
  }

  // Persist if incident_id present
  if (body.incident_id) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ ok: false, error: "missing_service_role", code: "CONFIG" }, 500);
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Look up the incident to scope user_id (defense-in-depth even with service role)
    const { data: row, error: lookupErr } = await admin
      .from("maintenance_incidents")
      .select("id, user_id, deleted_at")
      .eq("id", body.incident_id)
      .maybeSingle();
    if (lookupErr) return jsonResponse({ ok: false, error: lookupErr.message, code: "DB" }, 500);
    if (!row) return jsonResponse({ ok: false, error: "incident_not_found", code: "NOT_FOUND" }, 404);
    if (row.deleted_at) return jsonResponse({ ok: false, error: "incident_deleted", code: "GONE" }, 410);

    // When called with a user JWT, enforce that the incident belongs to that user.
    if (authedUserId && authedUserId !== row.user_id) {
      return jsonResponse({ ok: false, error: "forbidden", code: "FORBIDDEN" }, 403);
    }
    const targetUserId = authedUserId ?? body.user_id ?? row.user_id;
    if (body.user_id && body.user_id !== row.user_id) {
      return jsonResponse({ ok: false, error: "user_mismatch", code: "FORBIDDEN" }, 403);
    }

    // pgvector accepts the array directly through PostgREST as a string literal,
    // but supabase-js converts numeric arrays fine — pass as string in pgvector format
    // to be explicit and avoid surprises.
    const vectorLiteral = "[" + embedding.join(",") + "]";
    const { error: updErr } = await admin
      .from("maintenance_incidents")
      // deno-lint-ignore no-explicit-any
      .update({ embedding: vectorLiteral as any })
      .eq("id", body.incident_id)
      .eq("user_id", targetUserId)
      .is("deleted_at", null);
    if (updErr) return jsonResponse({ ok: false, error: updErr.message, code: "DB" }, 500);

    return jsonResponse({ ok: true, persisted: true, incident_id: body.incident_id, dims: embedding.length });
  }

  return jsonResponse({ ok: true, persisted: false, embedding, dims: embedding.length });
});

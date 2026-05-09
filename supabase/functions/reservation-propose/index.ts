// reservation-propose — recibe un extracted_payload (típicamente del extractor),
// resuelve property + default_area_id, y encola UNA sola agent_action de tipo
// `create_reservation_with_mission` con idempotency_key
// `airbnb:{confirmation_code}:{check_in_date}`.
//
// Auth: HMAC (prod) o Bearer (testing) — mismo patrón que el resto.
// Status: siempre `proposed`, nunca auto-aprueba en Fase 2.

import { z } from "https://esm.sh/zod@3.23.8";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, jsonResponse } from "../_shared/cors.ts";
import { verifyRequest } from "../_shared/auth.ts";

const HMAC_SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";
const BEARER_TOKEN = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? undefined;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mission template para reservas Airbnb (Vista Pelícano por ahora).
const RESERVATION_TEMPLATE_ID = "80eeafac-c10a-44ce-a81c-2092ec8d9057";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

// Mismo shape que devuelve reservation-extract (payload) — campo a campo.
const reservationPayloadSchema = z.object({
  source: z.enum(["airbnb", "vrbo", "booking"]),
  confirmation_code: z.string().min(1),
  guest_name: z.string().min(1),
  guest_email: z.string().email().optional().nullable(),
  guest_phone: z.string().optional().nullable(),
  check_in_date: dateString,
  check_out_date: dateString,
  number_of_guests: z.number().int().positive().optional().nullable(),
  payout_amount: z.number().optional().nullable(),
  cleaning_fee: z.number().optional().nullable(),
  taxes_or_fees: z.number().optional().nullable(),
  source_email_ids: z.array(z.string()).optional(),
});

const inputSchema = z.object({
  extracted_payload: reservationPayloadSchema,
  confidence: z.number().min(0).max(1),
  low_confidence: z.boolean().optional(),
  source_email_id: z.string().optional(),
  property_id: z.string().uuid(),
});

function formatCheckInShort(iso: string): string {
  // "2026-07-03" -> "3 jul"
  try {
    const d = new Date(iso + "T12:00:00Z");
    const fmt = new Intl.DateTimeFormat("es", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return fmt.format(d).replace(/\.$/, "");
  } catch {
    return iso;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const rawBody = await req.text();
  const auth = await verifyRequest(HMAC_SECRET, BEARER_TOKEN, req.headers, rawBody);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: auth.error }, 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json_body" }, 400);
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: "invalid_input", issues: parsed.error.issues },
      422,
    );
  }
  const input = parsed.data;
  const r = input.extracted_payload;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Property lookup (own user, default_area_id)
  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("id, user_id, default_area_id")
    .eq("id", input.property_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (propErr) {
    console.error("reservation-propose: property lookup failed", propErr);
    return jsonResponse({ ok: false, error: "property_lookup_failed" }, 500);
  }
  if (!property) {
    return jsonResponse({ ok: false, error: "property_not_found" }, 404);
  }

  const idempotencyKey = `airbnb:${r.confirmation_code}:${r.check_in_date}`;
  const missionTitle = `Preparar estadía — ${r.guest_name} — ${formatCheckInShort(r.check_in_date)}`;

  // Inject source_email_id into the array if provided and not already there
  let sourceEmailIds = r.source_email_ids ?? [];
  if (input.source_email_id && !sourceEmailIds.includes(input.source_email_id)) {
    sourceEmailIds = [...sourceEmailIds, input.source_email_id];
  }

  const actionPayload = {
    property_id: property.id,
    reservation: { ...r, source_email_ids: sourceEmailIds },
    mission: {
      template_id: RESERVATION_TEMPLATE_ID,
      title: missionTitle,
      area_id: property.default_area_id,
    },
  };

  // Try insert; on idempotency conflict, fetch existing.
  const { data: inserted, error: insErr } = await supabase
    .from("agent_actions")
    .insert({
      user_id: property.user_id,
      source_type: "email",
      source_ref: input.source_email_id ?? null,
      agent_name: "reservation-propose",
      action_type: "create_reservation_with_mission",
      payload: actionPayload,
      confidence_score: input.confidence,
      requires_approval: true,
      idempotency_key: idempotencyKey,
      status: "proposed",
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    // 23505 = unique_violation on idempotency_key
    const code = (insErr as { code?: string }).code;
    if (code === "23505") {
      const { data: existing } = await supabase
        .from("agent_actions")
        .select("id, status")
        .eq("user_id", property.user_id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      console.log(JSON.stringify({
        agent: "reservation-propose",
        confirmation_code: r.confirmation_code,
        confidence: input.confidence,
        outcome: "duplicate",
        action_id: existing?.id,
      }));
      return jsonResponse({
        ok: true,
        duplicate: true,
        action_id: existing?.id ?? null,
        existing_status: existing?.status ?? null,
        idempotency_key: idempotencyKey,
      });
    }
    console.error("reservation-propose: insert failed", insErr);
    return jsonResponse({ ok: false, error: "insert_failed", detail: insErr.message }, 500);
  }

  console.log(JSON.stringify({
    agent: "reservation-propose",
    confirmation_code: r.confirmation_code,
    confidence: input.confidence,
    low_confidence: input.low_confidence ?? false,
    outcome: "proposed",
    action_id: inserted?.id,
    idempotency_key: idempotencyKey,
  }));

  return jsonResponse({
    ok: true,
    duplicate: false,
    action_id: inserted?.id,
    idempotency_key: idempotencyKey,
    mission_title: missionTitle,
  });
});

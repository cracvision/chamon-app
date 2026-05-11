// reservation-propose — dispatch por event_type:
//   - 'new'    : encola create_reservation_with_mission (idempotency: airbnb:{code}:{check_in})
//   - 'cancel' : busca reservation existente y encola cancel_reservation
//                (idempotency: airbnb:{code}:cancel)
//   - 'update' : computa diff vs reservation existente y encola update_reservation
//                (idempotency: airbnb:{code}:update:{new_check_in}:{new_check_out})
//
// Si no existe reservation matching para cancel/update → response { skipped: true,
// reason: 'no_matching_reservation' } y queda registrado en email_ingestion_log.

import { z } from "https://esm.sh/zod@3.23.8";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, jsonResponse } from "../_shared/cors.ts";
import { verifyRequest } from "../_shared/auth.ts";
import { enqueueAgentAction } from "../_shared/agent-actions.ts";

const HMAC_SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";
const BEARER_TOKEN = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? undefined;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RESERVATION_TEMPLATE_ID = "80eeafac-c10a-44ce-a81c-2092ec8d9057";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

// 'new' shape (full payload, both dates required)
const newReservationPayloadSchema = z.object({
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

// 'cancel'/'update' shape (only confirmation_code is hard-required)
const partialReservationPayloadSchema = z.object({
  source: z.enum(["airbnb", "vrbo", "booking"]).optional(),
  confirmation_code: z.string().min(1),
  guest_name: z.string().optional().nullable(),
  guest_email: z.string().email().optional().nullable(),
  guest_phone: z.string().optional().nullable(),
  check_in_date: dateString.optional().nullable(),
  check_out_date: dateString.optional().nullable(),
  number_of_guests: z.number().int().positive().optional().nullable(),
  payout_amount: z.number().optional().nullable(),
  cleaning_fee: z.number().optional().nullable(),
  taxes_or_fees: z.number().optional().nullable(),
  source_email_ids: z.array(z.string()).optional(),
});

const inputSchema = z.object({
  extracted_payload: z.union([newReservationPayloadSchema, partialReservationPayloadSchema]),
  confidence: z.number().min(0).max(1),
  low_confidence: z.boolean().optional(),
  source_email_id: z.string().optional(),
  property_id: z.string().uuid(),
  event_type: z.enum(["new", "cancel", "update"]).optional().default("new"),
  cancelled_by: z.enum(["host", "guest", "platform", "unknown"]).optional().nullable(),
});

const UPDATABLE_FIELDS = [
  "check_in_date", "check_out_date", "check_in_time", "check_out_time",
  "guest_name", "guest_email", "guest_phone", "number_of_guests",
  "payout_amount", "cleaning_fee", "taxes_or_fees",
] as const;

type Updatable = typeof UPDATABLE_FIELDS[number];

function formatCheckInShort(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00Z");
    return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" })
      .format(d).replace(/\.$/, "");
  } catch {
    return iso;
  }
}

// Insert a sibling calendar action for a reservation event. Best-effort:
// duplicate (23505) is treated as success; any other failure is logged but
// does NOT block the main reservation action that was already enqueued.
async function enqueueCalendarSibling(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: {
    userId: string;
    sourceEmailId: string | null;
    groupKey: string;
    actionType: "create_calendar_event" | "update_calendar_event" | "delete_calendar_event";
    idempotencyKey: string;
    payload: Record<string, unknown>;
    confidence: number;
  },
): Promise<{ action_id: string | null; duplicate: boolean; error?: string }> {
  const result = await enqueueAgentAction(supabase, {
    user_id: args.userId,
    source_type: "email",
    source_ref: args.sourceEmailId,
    agent_name: "reservation-propose",
    action_type: args.actionType,
    payload: args.payload,
    confidence_score: args.confidence,
    requires_approval: true,
    idempotency_key: args.idempotencyKey,
    group_key: args.groupKey,
  });
  if (!result.ok) {
    console.error("reservation-propose: calendar sibling enqueue failed", result.error);
    return { action_id: null, duplicate: false, error: result.error };
  }
  return { action_id: result.action_id, duplicate: result.duplicate };
}

function computeDiff(
  existing: Record<string, any>,
  extracted: Record<string, any>,
): Record<string, string | number> {
  const diff: Record<string, string | number> = {};
  for (const k of UPDATABLE_FIELDS) {
    const extVal = extracted[k];
    if (extVal === undefined || extVal === null || extVal === "") continue;
    const exVal = existing[k];
    // Compare as ISO strings to avoid Date object pitfalls
    const a = exVal === null || exVal === undefined ? "" : String(exVal);
    const b = String(extVal);
    if (a !== b) {
      diff[k] = typeof extVal === "number" ? extVal : String(extVal);
    }
  }
  return diff;
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
  const r = input.extracted_payload as Record<string, any>;
  const eventType = input.event_type;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Property lookup (own user, default_area_id) — needed for 'new'; for cancel/update
  // we resolve user_id from the matched reservation, but we still verify property exists.
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
  const userId = property.user_id;

  // ---------- NEW ----------
  if (eventType === "new") {
    // Re-validate strict shape for 'new'
    const newParsed = newReservationPayloadSchema.safeParse(r);
    if (!newParsed.success) {
      return jsonResponse(
        { ok: false, error: "invalid_new_payload", issues: newParsed.error.issues },
        422,
      );
    }
    const nr = newParsed.data;

    const idempotencyKey = `airbnb:${nr.confirmation_code}:${nr.check_in_date}`;
    const missionTitle = `Preparar estadía — ${nr.guest_name} — ${formatCheckInShort(nr.check_in_date)}`;

    let sourceEmailIds = nr.source_email_ids ?? [];
    if (input.source_email_id && !sourceEmailIds.includes(input.source_email_id)) {
      sourceEmailIds = [...sourceEmailIds, input.source_email_id];
    }

    const actionPayload = {
      property_id: property.id,
      reservation: { ...nr, source_email_ids: sourceEmailIds },
      mission: {
        template_id: RESERVATION_TEMPLATE_ID,
        title: missionTitle,
        area_id: property.default_area_id,
      },
    };

    const enqueueResult = await enqueueAgentAction(supabase, {
      user_id: userId,
      source_type: "email",
      source_ref: input.source_email_id ?? null,
      agent_name: "reservation-propose",
      action_type: "create_reservation_with_mission",
      payload: actionPayload,
      confidence_score: input.confidence,
      requires_approval: true,
      idempotency_key: idempotencyKey,
      group_key: idempotencyKey,
    });

    if (!enqueueResult.ok) {
      return jsonResponse({ ok: false, error: "insert_failed", detail: enqueueResult.error, issues: enqueueResult.issues }, 500);
    }
    if (enqueueResult.duplicate) {
      return jsonResponse({
        ok: true, duplicate: true,
        action_id: enqueueResult.action_id,
        existing_status: enqueueResult.existing_status ?? null,
        idempotency_key: idempotencyKey,
      });
    }
    const insertedId = enqueueResult.action_id;

    // Sibling: create_calendar_event (resolver-based, since reservation_id no existe aún)
    const calSibling = await enqueueCalendarSibling(supabase, {
      userId,
      sourceEmailId: input.source_email_id ?? null,
      groupKey: idempotencyKey,
      actionType: "create_calendar_event",
      idempotencyKey: `${idempotencyKey}:calendar_create`,
      payload: {
        pending_reservation_confirmation_code: nr.confirmation_code,
        pending_check_in_date: nr.check_in_date,
        confirmation_code: nr.confirmation_code,
      },
      confidence: input.confidence,
    });

    console.log(JSON.stringify({
      agent: "reservation-propose", event_type: "new",
      confirmation_code: nr.confirmation_code, action_id: inserted?.id,
      outcome: "proposed", idempotency_key: idempotencyKey,
      calendar_sibling_action_id: calSibling.action_id,
      calendar_sibling_duplicate: calSibling.duplicate,
    }));
    return jsonResponse({
      ok: true, duplicate: false,
      action_id: inserted?.id, idempotency_key: idempotencyKey,
      mission_title: missionTitle, event_type: "new",
      group_key: idempotencyKey,
      calendar_sibling: calSibling,
    });
  }

  // ---------- CANCEL / UPDATE ----------
  // Both require an existing reservation matched by confirmation_code.
  const { data: existing, error: lookupErr } = await supabase
    .from("reservations")
    .select("id, mission_id, status, check_in_date, check_out_date, check_in_time, check_out_time, guest_name, guest_email, guest_phone, number_of_guests, payout_amount, cleaning_fee, taxes_or_fees, user_id")
    .eq("user_id", userId)
    .eq("confirmation_code", r.confirmation_code)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupErr) {
    console.error("reservation-propose: existing lookup failed", lookupErr);
    return jsonResponse({ ok: false, error: "lookup_failed", detail: lookupErr.message }, 500);
  }

  if (!existing) {
    // Log the orphan into email_ingestion_log if we have a source_email_id
    if (input.source_email_id) {
      // Best-effort upsert — uniqueness on (user_id, gmail_message_id) will dedupe
      await supabase.from("email_ingestion_log").upsert({
        user_id: userId,
        gmail_message_id: input.source_email_id,
        classification: "reservation_orphan",
        confidence_score: input.confidence,
        extracted_payload: { ...r, event_type: eventType },
        error_message: `no_matching_reservation:${r.confirmation_code}`,
        processed_at: new Date().toISOString(),
      }, { onConflict: "user_id,gmail_message_id" });
    }
    console.log(JSON.stringify({
      agent: "reservation-propose", event_type: eventType,
      confirmation_code: r.confirmation_code, outcome: "no_matching_reservation",
    }));
    return jsonResponse({
      ok: true, skipped: true, reason: "no_matching_reservation",
      confirmation_code: r.confirmation_code, event_type: eventType,
    });
  }

  // ---------- CANCEL ----------
  if (eventType === "cancel") {
    if (existing.status === "cancelled") {
      return jsonResponse({
        ok: true, skipped: true, reason: "already_cancelled",
        reservation_id: existing.id, event_type: "cancel",
      });
    }

    const idempotencyKey = `airbnb:${r.confirmation_code}:cancel`;
    const actionPayload = {
      reservation_id: existing.id,
      cancelled_by: input.cancelled_by ?? "unknown",
      cancellation_email_id: input.source_email_id ?? null,
      confirmation_code: r.confirmation_code,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("agent_actions")
      .insert({
        user_id: userId,
        source_type: "email",
        source_ref: input.source_email_id ?? null,
        agent_name: "reservation-propose",
        action_type: "cancel_reservation",
        payload: actionPayload,
        confidence_score: input.confidence,
        requires_approval: true,
        idempotency_key: idempotencyKey,
        group_key: idempotencyKey,
        status: "proposed",
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      const code = (insErr as { code?: string }).code;
      if (code === "23505") {
        const { data: dup } = await supabase
          .from("agent_actions")
          .select("id, status")
          .eq("user_id", userId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        return jsonResponse({
          ok: true, duplicate: true, action_id: dup?.id ?? null,
          existing_status: dup?.status ?? null, idempotency_key: idempotencyKey,
          event_type: "cancel",
        });
      }
      return jsonResponse({ ok: false, error: "insert_failed", detail: insErr.message }, 500);
    }

    const calSibling = await enqueueCalendarSibling(supabase, {
      userId,
      sourceEmailId: input.source_email_id ?? null,
      groupKey: idempotencyKey,
      actionType: "delete_calendar_event",
      idempotencyKey: `${idempotencyKey}:calendar_delete`,
      payload: {
        reservation_id: existing.id,
        confirmation_code: r.confirmation_code,
      },
      confidence: input.confidence,
    });

    console.log(JSON.stringify({
      agent: "reservation-propose", event_type: "cancel",
      confirmation_code: r.confirmation_code, action_id: inserted?.id,
      outcome: "proposed", idempotency_key: idempotencyKey,
      calendar_sibling_action_id: calSibling.action_id,
      calendar_sibling_duplicate: calSibling.duplicate,
    }));
    return jsonResponse({
      ok: true, duplicate: false, action_id: inserted?.id,
      idempotency_key: idempotencyKey, event_type: "cancel",
      group_key: idempotencyKey,
      calendar_sibling: calSibling,
    });
  }

  // ---------- UPDATE ----------
  if (eventType === "update") {
    const diff = computeDiff(existing as Record<string, any>, r);
    if (Object.keys(diff).length === 0) {
      return jsonResponse({
        ok: true, skipped: true, reason: "no_changes_detected",
        reservation_id: existing.id, event_type: "update",
      });
    }
    const recalcDates = "check_in_date" in diff || "check_out_date" in diff;
    const newCheckIn = (diff.check_in_date as string) ?? existing.check_in_date;
    const newCheckOut = (diff.check_out_date as string) ?? existing.check_out_date;
    const idempotencyKey = `airbnb:${r.confirmation_code}:update:${newCheckIn}:${newCheckOut}`;

    const actionPayload = {
      reservation_id: existing.id,
      updates: diff,
      recalc_task_dates: recalcDates,
      confirmation_code: r.confirmation_code,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("agent_actions")
      .insert({
        user_id: userId,
        source_type: "email",
        source_ref: input.source_email_id ?? null,
        agent_name: "reservation-propose",
        action_type: "update_reservation",
        payload: actionPayload,
        confidence_score: input.confidence,
        requires_approval: true,
        idempotency_key: idempotencyKey,
        group_key: idempotencyKey,
        status: "proposed",
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      const code = (insErr as { code?: string }).code;
      if (code === "23505") {
        const { data: dup } = await supabase
          .from("agent_actions")
          .select("id, status")
          .eq("user_id", userId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        return jsonResponse({
          ok: true, duplicate: true, action_id: dup?.id ?? null,
          existing_status: dup?.status ?? null, idempotency_key: idempotencyKey,
          event_type: "update",
        });
      }
      return jsonResponse({ ok: false, error: "insert_failed", detail: insErr.message }, 500);
    }

    const calSibling = await enqueueCalendarSibling(supabase, {
      userId,
      sourceEmailId: input.source_email_id ?? null,
      groupKey: idempotencyKey,
      actionType: "update_calendar_event",
      idempotencyKey: `${idempotencyKey}:calendar_update`,
      payload: {
        reservation_id: existing.id,
        confirmation_code: r.confirmation_code,
      },
      confidence: input.confidence,
    });

    console.log(JSON.stringify({
      agent: "reservation-propose", event_type: "update",
      confirmation_code: r.confirmation_code, action_id: inserted?.id,
      outcome: "proposed", idempotency_key: idempotencyKey,
      changed_fields: Object.keys(diff), recalc_task_dates: recalcDates,
      calendar_sibling_action_id: calSibling.action_id,
      calendar_sibling_duplicate: calSibling.duplicate,
    }));
    return jsonResponse({
      ok: true, duplicate: false, action_id: inserted?.id,
      idempotency_key: idempotencyKey, event_type: "update",
      changed_fields: Object.keys(diff), recalc_task_dates: recalcDates,
      group_key: idempotencyKey,
      calendar_sibling: calSibling,
    });
  }

  return jsonResponse({ ok: false, error: "unknown_event_type" }, 400);
});

// execute-calendar-action — runs a single calendar agent_action by calling the
// Google Calendar gateway, then finalizes the action atomically via the
// `finalize_calendar_action` RPC.
//
// Auth: requires the caller's JWT (anon-key + bearer). The RPC is SECURITY DEFINER
// but verifies auth.uid() = action.user_id, so we forward the caller's token.
//
// Body: { action_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY") ?? "";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

// ---------- Helpers ----------

async function buildEventId(confirmationCode: string, checkInDate: string): Promise<string> {
  const data = new TextEncoder().encode(`${confirmationCode}:${checkInDate}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Google Calendar custom event IDs must be base32hex (chars 0-9 and a-v), length 5-1024.
  return `mc${hashHex.substring(0, 30)}`;
}

function fmtTime(t: string | null | undefined): string | null {
  if (!t) return null;
  // Accept HH:mm or HH:mm:ss
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : null;
}

function buildSummary(r: Record<string, any>): string {
  const ci = fmtTime(r.check_in_time);
  const co = fmtTime(r.check_out_time);
  const times = ci || co ? ` (in: ${ci ?? "??"} / out: ${co ?? "??"})` : "";
  return `${r.guest_name ?? "Reserva"} — Vista Pelícano${times}`;
}

function buildDescription(r: Record<string, any>, gmailMsgId: string | null): string {
  const lines: string[] = [];
  lines.push(`🏖️ ${r.guest_name ?? "—"} · ${r.number_of_guests ?? "?"} huéspedes`);
  if (r.guest_email) lines.push(`📧 ${r.guest_email}`);
  if (r.guest_phone) lines.push(`📞 ${r.guest_phone}`);
  const money: string[] = [];
  if (r.payout_amount != null) money.push(`Payout: $${r.payout_amount}`);
  if (r.cleaning_fee != null) money.push(`Cleaning: $${r.cleaning_fee}`);
  if (money.length) lines.push(`💵 ${money.join(" | ")}`);
  if (r.confirmation_code) lines.push(`🔗 Confirmation: ${r.confirmation_code}`);
  if (gmailMsgId) lines.push(`📨 Email: ${gmailMsgId}`);
  return lines.join("\n");
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// All-day event end is exclusive in Google Calendar.
function buildEventBody(
  r: Record<string, any>,
  tz: string,
  customId?: string,
  gmailMsgId: string | null = null,
): Record<string, any> {
  const ci = fmtTime(r.check_in_time);
  const co = fmtTime(r.check_out_time);
  const allDay = !ci && !co;
  const startObj = allDay
    ? { date: r.check_in_date, timeZone: tz }
    : { dateTime: `${r.check_in_date}T${ci ?? "15:00"}:00`, timeZone: tz };
  const endObj = allDay
    ? { date: addDays(r.check_out_date, 1), timeZone: tz }
    : { dateTime: `${r.check_out_date}T${co ?? "11:00"}:00`, timeZone: tz };

  const body: Record<string, any> = {
    summary: buildSummary(r),
    description: buildDescription(r, gmailMsgId),
    start: startObj,
    end: endObj,
    extendedProperties: {
      private: {
        reservation_id: r.id ?? "",
        confirmation_code: r.confirmation_code ?? "",
      },
    },
  };
  if (customId) body.id = customId;
  return body;
}

async function gatewayFetch(
  path: string,
  init: RequestInit,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let body: any = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ ok: false, error: "missing_bearer" }, 401);
  }

  if (!LOVABLE_API_KEY || !GOOGLE_CALENDAR_API_KEY) {
    return jsonResponse({ ok: false, error: "calendar_connector_not_configured" }, 500);
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: "invalid_json" }, 400); }
  const actionId: string | undefined = body?.action_id;
  if (!actionId) return jsonResponse({ ok: false, error: "missing_action_id" }, 400);

  // Client bound to caller's JWT; RPCs run as that user (auth.uid() = caller).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Load action (RLS scoped to caller).
  const { data: action, error: actionErr } = await supabase
    .from("agent_actions")
    .select("id, user_id, action_type, payload, status, idempotency_key, group_key, source_ref")
    .eq("id", actionId)
    .maybeSingle();
  if (actionErr) {
    console.error("[execute-calendar-action] action lookup failed:", actionErr);
    return jsonResponse({ ok: false, error: "action_lookup_failed" }, 500);
  }
  if (!action) return jsonResponse({ ok: false, error: "action_not_found" }, 404);

  if (!["create_calendar_event", "update_calendar_event", "delete_calendar_event"].includes(action.action_type)) {
    return jsonResponse({ ok: false, error: "wrong_action_type" }, 400);
  }

  if (action.status === "executed") {
    return jsonResponse({ ok: true, already: true, action_id: action.id });
  }
  if (!["proposed", "approved"].includes(action.status)) {
    return jsonResponse({ ok: false, error: "invalid_state" }, 409);
  }

  const payload = (action.payload ?? {}) as Record<string, any>;
  let reservationId: string | null = payload.reservation_id ?? null;
  const confirmationCode: string | null = payload.confirmation_code ?? payload.pending_reservation_confirmation_code ?? null;
  const pendingCheckIn: string | null = payload.pending_check_in_date ?? null;

  // For create with pending refs, resolve reservation_id via RPC.
  if (!reservationId && action.action_type === "create_calendar_event" && confirmationCode && pendingCheckIn) {
    const { data: resolved, error: resolveErr } = await supabase.rpc("resolve_pending_reservation_id" as any, {
      _confirmation_code: confirmationCode,
      _check_in_date: pendingCheckIn,
    });
    if (resolveErr) {
      console.error("[execute-calendar-action] resolve failed:", resolveErr);
      return jsonResponse({ ok: false, error: "resolve_failed" }, 500);
    }
    if (!resolved) {
      // Mark failed — sister reservation didn't run yet (or doesn't exist).
      await supabase.rpc("finalize_calendar_action" as any, {
        _action_id: actionId, _mode: "failed",
        _error_message: `reservation_not_found_for_calendar:${confirmationCode}@${pendingCheckIn}`,
      });
      return jsonResponse({ ok: false, error: "reservation_not_found_for_calendar" }, 422);
    }
    reservationId = resolved as string;
    // Persist resolved id into the action payload so finalize_calendar_action can update reservations.calendar_event_id.
    await supabase
      .from("agent_actions")
      .update({ payload: { ...payload, reservation_id: reservationId } })
      .eq("id", actionId);
  }

  // 2) Load reservation (+ property)
  if (!reservationId) {
    return jsonResponse({ ok: false, error: "reservation_id_missing_in_payload" }, 422);
  }
  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id, user_id, property_id, confirmation_code, guest_name, guest_email, guest_phone, number_of_guests, payout_amount, cleaning_fee, taxes_or_fees, check_in_date, check_out_date, check_in_time, check_out_time, calendar_event_id, source_email_ids")
    .eq("id", reservationId)
    .maybeSingle();
  if (resErr) {
    console.error("[execute-calendar-action] reservation lookup failed:", resErr);
    return jsonResponse({ ok: false, error: "reservation_lookup_failed" }, 500);
  }
  if (!reservation) {
    await supabase.rpc("finalize_calendar_action" as any, {
      _action_id: actionId, _mode: "failed", _error_message: "reservation_not_found",
    });
    return jsonResponse({ ok: false, error: "reservation_not_found" }, 404);
  }

  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("id, calendar_id, calendar_timezone")
    .eq("id", reservation.property_id!)
    .maybeSingle();
  if (propErr) {
    console.error("[execute-calendar-action] property lookup failed:", propErr);
    return jsonResponse({ ok: false, error: "property_lookup_failed" }, 500);
  }

  const calendarId: string | null = property?.calendar_id ?? null;
  const tz: string = property?.calendar_timezone ?? "America/Puerto_Rico";

  // 3) Skip if no calendar_id (feature flag per property)
  if (!calendarId) {
    const { data: fin } = await supabase.rpc("finalize_calendar_action" as any, {
      _action_id: actionId, _mode: "skipped", _skipped_reason: "no_calendar_id_on_property",
    });
    return jsonResponse({ ok: true, skipped: true, reason: "no_calendar_id_on_property", finalize: fin });
  }

  const gmailMsgId = (reservation.source_email_ids?.[0] ?? action.source_ref) || null;

  // ---------- CREATE ----------
  if (action.action_type === "create_calendar_event") {
    if (reservation.calendar_event_id) {
      const { data: fin } = await supabase.rpc("finalize_calendar_action" as any, {
        _action_id: actionId, _mode: "skipped",
        _calendar_event_id: reservation.calendar_event_id,
        _skipped_reason: "calendar_event_already_exists",
      });
      return jsonResponse({ ok: true, skipped: true, reason: "calendar_event_already_exists", calendar_event_id: reservation.calendar_event_id, finalize: fin });
    }

    const eventId = await buildEventId(reservation.confirmation_code ?? "noconf", reservation.check_in_date!);
    const eventBody = buildEventBody({ ...reservation, id: reservation.id }, tz, eventId, gmailMsgId);

    const { status, body: respBody } = await gatewayFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: "POST", body: JSON.stringify(eventBody) },
    );

    let createdId = eventId;
    let htmlLink: string | null = null;

    if (status === 200 || status === 201) {
      createdId = respBody?.id ?? eventId;
      htmlLink = respBody?.htmlLink ?? null;
    } else if (status === 409) {
      // Already exists in Google with our deterministic id — treat as success.
      htmlLink = null;
    } else {
      const errMsg = `google_create_failed:${status}:${typeof respBody === "string" ? respBody : JSON.stringify(respBody)}`;
      console.error("execute-calendar-action create failed", errMsg);
      await supabase.rpc("finalize_calendar_action" as any, {
        _action_id: actionId, _mode: "failed", _error_message: errMsg,
      });
      return jsonResponse({ ok: false, error: "google_create_failed", status }, 502);
    }

    const { data: fin, error: finErr } = await supabase.rpc("finalize_calendar_action" as any, {
      _action_id: actionId, _mode: "created",
      _calendar_event_id: createdId, _html_link: htmlLink,
      _extra: { calendar_id: calendarId, conflict_409: status === 409 },
    });
    if (finErr) {
      console.error("[execute-calendar-action] finalize failed:", finErr);
      return jsonResponse({ ok: false, error: "finalize_failed" }, 500);
    }
    return jsonResponse({ ok: true, created: true, calendar_event_id: createdId, html_link: htmlLink, finalize: fin });
  }

  // ---------- UPDATE ----------
  if (action.action_type === "update_calendar_event") {
    if (!reservation.calendar_event_id) {
      const { data: fin } = await supabase.rpc("finalize_calendar_action" as any, {
        _action_id: actionId, _mode: "skipped", _skipped_reason: "no_calendar_event_id_on_reservation",
      });
      return jsonResponse({ ok: true, skipped: true, reason: "no_calendar_event_id_on_reservation", finalize: fin });
    }

    // Build a full body from the (already-updated) reservation; PATCH replaces only fields we send.
    const patchBody = buildEventBody({ ...reservation, id: reservation.id }, tz, undefined, gmailMsgId);

    const { status, body: respBody } = await gatewayFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(reservation.calendar_event_id)}`,
      { method: "PATCH", body: JSON.stringify(patchBody) },
    );

    if (status === 404) {
      // Event was deleted in Google externally — treat as a re-create.
      const eventId = await buildEventId(reservation.confirmation_code ?? "noconf", reservation.check_in_date!);
      const recreateBody = { ...patchBody, id: eventId };
      const { status: cStatus, body: cBody } = await gatewayFetch(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: "POST", body: JSON.stringify(recreateBody) },
      );
      if (cStatus !== 200 && cStatus !== 201 && cStatus !== 409) {
        const errMsg = `google_recreate_failed:${cStatus}:${JSON.stringify(cBody)}`;
        await supabase.rpc("finalize_calendar_action" as any, {
          _action_id: actionId, _mode: "failed", _error_message: errMsg,
        });
        return jsonResponse({ ok: false, error: "google_recreate_failed", status: cStatus }, 502);
      }
      const { data: fin } = await supabase.rpc("finalize_calendar_action" as any, {
        _action_id: actionId, _mode: "created",
        _calendar_event_id: cBody?.id ?? eventId,
        _html_link: cBody?.htmlLink ?? null,
        _extra: { recreated_after_404: true, calendar_id: calendarId },
      });
      return jsonResponse({ ok: true, recreated: true, finalize: fin });
    }

    if (status !== 200) {
      const errMsg = `google_update_failed:${status}:${typeof respBody === "string" ? respBody : JSON.stringify(respBody)}`;
      console.error("execute-calendar-action update failed", errMsg);
      await supabase.rpc("finalize_calendar_action" as any, {
        _action_id: actionId, _mode: "failed", _error_message: errMsg,
      });
      return jsonResponse({ ok: false, error: "google_update_failed", status }, 502);
    }

    const { data: fin } = await supabase.rpc("finalize_calendar_action" as any, {
      _action_id: actionId, _mode: "updated",
      _calendar_event_id: reservation.calendar_event_id,
      _html_link: respBody?.htmlLink ?? null,
      _extra: { calendar_id: calendarId },
    });
    return jsonResponse({ ok: true, updated: true, calendar_event_id: reservation.calendar_event_id, finalize: fin });
  }

  // ---------- DELETE ----------
  if (action.action_type === "delete_calendar_event") {
    if (!reservation.calendar_event_id) {
      const { data: fin } = await supabase.rpc("finalize_calendar_action" as any, {
        _action_id: actionId, _mode: "skipped", _skipped_reason: "no_calendar_event_id_on_reservation",
      });
      return jsonResponse({ ok: true, skipped: true, reason: "no_calendar_event_id_on_reservation", finalize: fin });
    }

    const formerId = reservation.calendar_event_id;
    const { status, body: respBody } = await gatewayFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(formerId)}`,
      { method: "DELETE" },
    );

    if (status === 200 || status === 204 || status === 404 || status === 410) {
      const { data: fin } = await supabase.rpc("finalize_calendar_action" as any, {
        _action_id: actionId, _mode: "deleted",
        _calendar_event_id: formerId,
        _extra: { google_status: status, calendar_id: calendarId },
      });
      return jsonResponse({ ok: true, deleted: true, former_calendar_event_id: formerId, finalize: fin });
    }

    const errMsg = `google_delete_failed:${status}:${typeof respBody === "string" ? respBody : JSON.stringify(respBody)}`;
    console.error("execute-calendar-action delete failed", errMsg);
    await supabase.rpc("finalize_calendar_action" as any, {
      _action_id: actionId, _mode: "failed", _error_message: errMsg,
    });
    return jsonResponse({ ok: false, error: "google_delete_failed", status }, 502);
  }

  return jsonResponse({ ok: false, error: "unreachable" }, 500);
});

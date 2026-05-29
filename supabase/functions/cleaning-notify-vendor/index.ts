// cleaning-notify-vendor — dispatch a single notify_vendor_cleaning agent_action.
//
// Body:  { action_id: uuid }
// Auth:  HMAC or Bearer (CHAMON_ELEVENLABS_BEARER), same pattern as other
//        Chamón edge fns. Cron and the dispatcher hit it with Bearer.
//
// Flow:
//   1. Lookup agent_action (scoped via SERVICE_ROLE; user_id taken from row).
//   2. Resolve vendor contact + property.
//   3. Channel selection:
//        preferred_channel='whatsapp' AND whatsapp_phone normalizable
//          → try WhatsApp template; on fail → email fallback if email present.
//        preferred_channel='email' OR no whatsapp → email.
//        no email AND no whatsapp_phone → finalize_notify_vendor(mode='skipped').
//   4. Call finalize_notify_vendor(mode='sent'|'failed') RPC which updates
//      task.vendor_status, inserts notifications row + events row, marks
//      action executed/failed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { CORS, jsonResponse } from "../_shared/cors.ts";
import { verifyRequest } from "../_shared/auth.ts";
import { normalizeE164, toWhatsAppDigits } from "../_shared/phone.ts";
import { sendWhatsAppTemplate } from "../_shared/whatsapp.ts";
import { renderVendorCleaningHtml, sendVendorEmail } from "../_shared/email-vendor.ts";

const HMAC_SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";
const BEARER_TOKEN = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? undefined;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TEMPLATE = Deno.env.get("WHATSAPP_CLEANING_TEMPLATE") ?? "cleaning_notify_v1";

const inputSchema = z.object({ action_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const raw = await req.text();
  const auth = await verifyRequest(HMAC_SECRET, BEARER_TOKEN, req.headers, raw);
  if (!auth.ok) return jsonResponse({ error: auth.error }, 401);

  let body: { action_id: string };
  try {
    body = inputSchema.parse(JSON.parse(raw || "{}"));
  } catch (e) {
    console.error("[cleaning-notify-vendor] invalid input:", e);
    return jsonResponse({ error: "invalid_input" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Load action.
  const { data: action, error: aErr } = await supabase
    .from("agent_actions").select("*").eq("id", body.action_id).maybeSingle();
  if (aErr || !action) return jsonResponse({ error: "action_not_found", detail: aErr?.message }, 404);
  if (action.action_type !== "notify_vendor_cleaning") {
    return jsonResponse({ error: "wrong_action_type", action_type: action.action_type }, 400);
  }
  if (action.status === "executed") {
    return jsonResponse({ ok: true, already: true, action_id: action.id, result: action.result });
  }
  if (action.status !== "proposed") {
    return jsonResponse({ error: "invalid_state", status: action.status }, 400);
  }

  const payload = action.payload ?? {};
  const taskId = payload.task_id as string;
  const vendorContactId = payload.vendor_contact_id as string;
  const propertyId = payload.property_id as string | undefined;
  const serviceType = payload.service_type as "pre_checkin" | "post_checkout";
  const serviceDate = payload.service_date as string;
  const guestCheckin = payload.guest_checkin_date as string;
  const reservationCode = (payload.reservation_confirmation_code as string | undefined) ?? null;

  // 2. Vendor + property.
  const { data: vendor } = await supabase
    .from("contacts")
    .select("id, name, email, whatsapp_phone, preferred_channel")
    .eq("id", vendorContactId).eq("user_id", action.user_id).maybeSingle();
  if (!vendor) {
    await finalize(supabase, action.id, "skipped", null, null, null, "vendor_not_found");
    return jsonResponse({ ok: false, mode: "skipped", reason: "vendor_not_found" });
  }

  let propertyName: string | undefined;
  if (propertyId) {
    const { data: prop } = await supabase
      .from("properties").select("name").eq("id", propertyId).maybeSingle();
    propertyName = prop?.name ?? undefined;
  }

  // 3. Channel selection.
  const waE164 = normalizeE164(vendor.whatsapp_phone);
  const waDigits = toWhatsAppDigits(waE164);
  const wantsWA = vendor.preferred_channel === "whatsapp" && !!waDigits;
  const hasEmail = !!vendor.email;

  if (!waDigits && !hasEmail) {
    await finalize(supabase, action.id, "skipped", null, null, null, "no_channel_available");
    return jsonResponse({ ok: false, mode: "skipped", reason: "no_channel_available" });
  }

  // 4a. Try WhatsApp first if preferred + configured.
  if (wantsWA) {
    const wa = await sendWhatsAppTemplate({
      toE164Digits: waDigits!,
      template: WHATSAPP_TEMPLATE,
      languageCode: "es",
      bodyParameters: [
        vendor.name ?? "vendor",
        serviceType === "pre_checkin" ? "limpieza pre check-in" : "limpieza post check-out",
        serviceDate,
        guestCheckin,
        propertyName ?? "la propiedad",
      ],
    });
    if (wa.ok) {
      await finalize(supabase, action.id, "sent", "whatsapp", wa.messageId, waE164, null);
      return jsonResponse({ ok: true, mode: "sent", channel: "whatsapp", message_id: wa.messageId });
    }
    // Fallback to email if available.
    if (!hasEmail) {
      const reason = wa.configured === false ? "whatsapp_not_configured" : `whatsapp_failed:${(wa as { status?: number }).status ?? 0}`;
      await finalize(supabase, action.id, "failed", "whatsapp", null, waE164, reason);
      return jsonResponse({ ok: false, mode: "failed", channel: "whatsapp", reason });
    }
    // fall through to email
  }

  // 4b. Email path.
  const tmpl = renderVendorCleaningHtml({
    vendorName: vendor.name ?? "vendor",
    serviceType,
    serviceDate,
    guestCheckinDate: guestCheckin,
    propertyName,
    reservationCode,
  });
  const em = await sendVendorEmail({
    to: vendor.email!,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
  });
  if (!em.ok) {
    await finalize(supabase, action.id, "failed", "email", null, vendor.email!, `email_failed:${em.status}:${em.error.slice(0, 200)}`);
    return jsonResponse({ ok: false, mode: "failed", channel: "email", error: em.error }, 502);
  }
  await finalize(supabase, action.id, "sent", "email", em.messageId, vendor.email!, null);
  return jsonResponse({ ok: true, mode: "sent", channel: "email", message_id: em.messageId, task_id: taskId });
});

// deno-lint-ignore no-explicit-any
async function finalize(
  supabase: any,
  actionId: string,
  mode: "sent" | "failed" | "skipped",
  channel: string | null,
  providerMessageId: string | null,
  toAddress: string | null,
  errorMessage: string | null,
) {
  const { error } = await supabase.rpc("finalize_notify_vendor", {
    _action_id: actionId,
    _mode: mode,
    _channel: channel,
    _provider_message_id: providerMessageId,
    _to_address: toAddress,
    _error_message: errorMessage,
    _extra: {},
  });
  if (error) console.error("[cleaning-notify-vendor] finalize_notify_vendor failed", error);
}

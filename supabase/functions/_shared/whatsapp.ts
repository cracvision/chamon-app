// WhatsApp Cloud API client (Meta Graph v20).
// Reads WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID from env.
// If either is missing, sendWhatsAppTemplate() returns
// { ok: false, configured: false } so callers can fall back to email.

const GRAPH_VERSION = "v20.0";

export interface WhatsAppTemplateInput {
  toE164Digits: string; // no leading '+'
  template: string; // e.g. 'cleaning_notify_v1'
  languageCode?: string; // default 'es'
  bodyParameters?: string[]; // text parameters in order
}

export type WhatsAppResult =
  | { ok: true; messageId: string; configured: true }
  | { ok: false; configured: false; reason: "not_configured" }
  | { ok: false; configured: true; status: number; error: string };

export async function sendWhatsAppTemplate(input: WhatsAppTemplateInput): Promise<WhatsAppResult> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
  if (!token || !phoneNumberId) {
    return { ok: false, configured: false, reason: "not_configured" };
  }

  const body = {
    messaging_product: "whatsapp",
    to: input.toE164Digits,
    type: "template",
    template: {
      name: input.template,
      language: { code: input.languageCode ?? "es" },
      components: input.bodyParameters && input.bodyParameters.length > 0
        ? [{
          type: "body",
          parameters: input.bodyParameters.map((t) => ({ type: "text", text: t })),
        }]
        : [],
    },
  };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, configured: true, status: res.status, error: text.slice(0, 500) };
  }
  let parsed: { messages?: Array<{ id?: string }> } = {};
  try {
    parsed = JSON.parse(text);
  } catch (_e) { /* ignore */ }
  const id = parsed?.messages?.[0]?.id ?? "";
  return { ok: true, messageId: id, configured: true };
}

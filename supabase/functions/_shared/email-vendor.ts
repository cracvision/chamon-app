// Vendor email via Resend (gateway). Uses LOVABLE_API_KEY + RESEND_API_KEY.

const RESEND_API_URL = "https://api.resend.com";

export interface VendorEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromOverride?: string;
}

export type VendorEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; status: number; error: string };

export async function sendVendorEmail(input: VendorEmailInput): Promise<VendorEmailResult> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = input.fromOverride ?? Deno.env.get("RESEND_FROM_EMAIL") ?? "Chamón <onboarding@resend.dev>";
  if (!lovableKey || !resendKey) {
    return { ok: false, status: 0, error: "resend_not_configured" };
  }

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: text.slice(0, 500) };
  }
  let parsed: { id?: string } = {};
  try { parsed = JSON.parse(text); } catch (_e) { /* ignore */ }
  return { ok: true, messageId: parsed?.id ?? "" };
}

export function renderVendorCleaningHtml(opts: {
  vendorName: string;
  serviceType: "pre_checkin" | "post_checkout";
  serviceDate: string; // YYYY-MM-DD
  guestCheckinDate: string;
  propertyName?: string;
  reservationCode?: string | null;
}): { subject: string; html: string; text: string } {
  const sLabel = opts.serviceType === "pre_checkin" ? "Limpieza pre check-in" : "Limpieza post check-out";
  const property = opts.propertyName ?? "la propiedad";
  const subject = `${sLabel} — ${opts.serviceDate} — ${property}`;
  const text = [
    `Hola ${opts.vendorName},`,
    ``,
    `Necesitamos coordinar ${sLabel.toLowerCase()} para ${property}.`,
    ``,
    `Fecha de servicio: ${opts.serviceDate}`,
    `Check-in del huésped: ${opts.guestCheckinDate}`,
    opts.reservationCode ? `Código de reserva: ${opts.reservationCode}` : ``,
    ``,
    `Por favor confirma respondiendo a este email.`,
    ``,
    `Gracias,`,
    `Chamón / Carlos`,
  ].filter(Boolean).join("\n");
  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; line-height: 1.5; color: #111;">
      <p>Hola <strong>${escapeHtml(opts.vendorName)}</strong>,</p>
      <p>Necesitamos coordinar <strong>${escapeHtml(sLabel.toLowerCase())}</strong> para <strong>${escapeHtml(property)}</strong>.</p>
      <ul>
        <li><strong>Fecha de servicio:</strong> ${escapeHtml(opts.serviceDate)}</li>
        <li><strong>Check-in del huésped:</strong> ${escapeHtml(opts.guestCheckinDate)}</li>
        ${opts.reservationCode ? `<li><strong>Código de reserva:</strong> ${escapeHtml(opts.reservationCode)}</li>` : ""}
      </ul>
      <p>Por favor confirmá respondiendo a este email.</p>
      <p>Gracias,<br/>Chamón / Carlos</p>
    </div>
  `.trim();
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

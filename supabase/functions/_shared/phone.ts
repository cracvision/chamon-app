// Phone normalization to E.164.
// Default country code: Puerto Rico / US (+1).
// WhatsApp Cloud API expects E.164 without the leading '+'.
export function normalizeE164(raw: string | null | undefined, defaultCC = "1"): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Strip everything except digits and a leading '+'.
  const hasPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return null;

  // If already starts with country code via '+', keep digits as-is.
  if (hasPlus) {
    if (s.length < 8 || s.length > 15) return null;
    return `+${s}`;
  }

  // 10-digit US/PR national number → prepend default CC.
  if (s.length === 10) return `+${defaultCC}${s}`;
  // 11+ digits beginning with default CC → already includes CC.
  if (s.length >= 11 && s.startsWith(defaultCC)) return `+${s}`;
  // Otherwise treat as already-international (e.g. 521..., 4477...).
  if (s.length >= 8 && s.length <= 15) return `+${s}`;
  return null;
}

// WhatsApp Cloud API wants the number without '+' (E.164 digits-only).
export function toWhatsAppDigits(e164: string | null): string | null {
  if (!e164) return null;
  return e164.replace(/^\+/, "");
}

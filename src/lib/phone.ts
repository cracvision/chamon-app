// Phone normalization to E.164. Mirrors supabase/functions/_shared/phone.ts.
export function normalizeE164(raw: string | null | undefined, defaultCC = "1"): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const hasPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return null;
  if (hasPlus) {
    if (s.length < 8 || s.length > 15) return null;
    return `+${s}`;
  }
  if (s.length === 10) return `+${defaultCC}${s}`;
  if (s.length >= 11 && s.startsWith(defaultCC)) return `+${s}`;
  if (s.length >= 8 && s.length <= 15) return `+${s}`;
  return null;
}

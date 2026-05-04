// Shared Gmail client for chamon-query handlers.
// Reads via the Lovable connector gateway so OAuth refresh is automatic.
// Scope required: gmail.readonly. All reads are filtered to Primary inbox.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function authHeaders(): Record<string, string> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY no está configurado");
  if (!gmailKey) throw new Error("GOOGLE_MAIL_API_KEY no está configurado (Gmail no conectado)");
  return {
    "Authorization": `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gmailKey,
  };
}

async function gmailGet(path: string): Promise<unknown> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gmail API ${path} falló [${res.status}]: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Gmail API ${path} devolvió JSON inválido: ${text.slice(0, 200)}`);
  }
}

export interface GmailMessageSummary {
  id: string;
  thread_id: string;
  from: string;
  subject: string;
  snippet: string;
  received_at: string; // ISO
  unread: boolean;
}

interface ListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
}

interface MessageResponse {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

function header(msg: MessageResponse, name: string): string {
  const h = msg.payload?.headers?.find((x) =>
    x.name.toLowerCase() === name.toLowerCase()
  );
  return h?.value ?? "";
}

async function fetchMessageMetadata(id: string): Promise<GmailMessageSummary> {
  const params = new URLSearchParams();
  params.set("format", "metadata");
  for (const h of ["From", "Subject", "Date"]) params.append("metadataHeaders", h);
  const msg = await gmailGet(`/users/me/messages/${id}?${params.toString()}`) as MessageResponse;
  const internal = msg.internalDate ? Number(msg.internalDate) : NaN;
  const receivedAt = Number.isFinite(internal)
    ? new Date(internal).toISOString()
    : (header(msg, "Date") || new Date(0).toISOString());
  return {
    id: msg.id,
    thread_id: msg.threadId,
    from: header(msg, "From"),
    subject: header(msg, "Subject") || "(sin asunto)",
    snippet: msg.snippet ?? "",
    received_at: receivedAt,
    unread: (msg.labelIds ?? []).includes("UNREAD"),
  };
}

/**
 * List messages from Primary inbox.
 *   q="category:primary" excludes Promotions/Social/Updates/Forums.
 *   Append "is:unread" when unreadOnly=true.
 *   Append "newer_than:1d" when todayOnly=true (approximate "today").
 */
export async function listPrimaryMessages(opts: {
  unreadOnly?: boolean;
  todayOnly?: boolean;
  maxResults?: number;
}): Promise<GmailMessageSummary[]> {
  const max = Math.max(1, Math.min(20, opts.maxResults ?? 10));
  const qParts = ["category:primary"];
  if (opts.unreadOnly) qParts.push("is:unread");
  if (opts.todayOnly) qParts.push("newer_than:1d");
  const params = new URLSearchParams({
    maxResults: String(max),
    q: qParts.join(" "),
  });
  const list = await gmailGet(`/users/me/messages?${params.toString()}`) as ListResponse;
  const ids = (list.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return [];
  const items = await Promise.all(ids.map(fetchMessageMetadata));
  // Newest first
  items.sort((a, b) => b.received_at.localeCompare(a.received_at));
  return items;
}

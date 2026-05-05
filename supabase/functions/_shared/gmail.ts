// Shared Gmail client for chamon-query handlers.
// Reads via the Lovable connector gateway so OAuth refresh is automatic.
// Scope required: gmail.readonly. All reads are filtered to Primary inbox.
//
// Multi-account support: scans env for GOOGLE_MAIL_API_KEY, GOOGLE_MAIL_API_KEY_1,
// GOOGLE_MAIL_API_KEY_2, ... Each key corresponds to one connected Gmail account.
// Fan-out happens in parallel; per-account errors are captured (not thrown) so a
// single bad token doesn't kill the whole response.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

// In-module cache: env var name -> resolved email address.
const emailCache = new Map<string, string>();

function lovableKey(): string {
  const k = Deno.env.get("LOVABLE_API_KEY");
  if (!k) throw new Error("LOVABLE_API_KEY no está configurado");
  return k;
}

/** Returns env var names of all linked Gmail connections (e.g. ["GOOGLE_MAIL_API_KEY", "GOOGLE_MAIL_API_KEY_1"]). */
export function listGmailAccountKeys(): string[] {
  const keys: string[] = [];
  if (Deno.env.get("GOOGLE_MAIL_API_KEY")) keys.push("GOOGLE_MAIL_API_KEY");
  for (let i = 1; i <= 10; i++) {
    const name = `GOOGLE_MAIL_API_KEY_${i}`;
    if (Deno.env.get(name)) keys.push(name);
  }
  return keys;
}

function authHeadersFor(envName: string): Record<string, string> {
  const gmailKey = Deno.env.get(envName);
  if (!gmailKey) throw new Error(`${envName} no está configurado`);
  return {
    "Authorization": `Bearer ${lovableKey()}`,
    "X-Connection-Api-Key": gmailKey,
  };
}

async function gmailGet(envName: string, path: string): Promise<unknown> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { headers: authHeadersFor(envName) });
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

/** Resolves and caches the email address behind a given env var. */
async function resolveAccountEmail(envName: string): Promise<string> {
  const cached = emailCache.get(envName);
  if (cached) return cached;
  const profile = await gmailGet(envName, "/users/me/profile") as { emailAddress?: string };
  const email = profile.emailAddress ?? envName;
  emailCache.set(envName, email);
  return email;
}

export interface GmailMessageSummary {
  id: string;
  thread_id: string;
  account: string; // email address of the owning Gmail account
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

async function fetchMessageMetadata(
  envName: string,
  account: string,
  id: string,
): Promise<GmailMessageSummary> {
  const params = new URLSearchParams();
  params.set("format", "metadata");
  for (const h of ["From", "Subject", "Date"]) params.append("metadataHeaders", h);
  const msg = await gmailGet(envName, `/users/me/messages/${id}?${params.toString()}`) as MessageResponse;
  const internal = msg.internalDate ? Number(msg.internalDate) : NaN;
  const receivedAt = Number.isFinite(internal)
    ? new Date(internal).toISOString()
    : (header(msg, "Date") || new Date(0).toISOString());
  return {
    id: msg.id,
    thread_id: msg.threadId,
    account,
    from: header(msg, "From"),
    subject: header(msg, "Subject") || "(sin asunto)",
    snippet: msg.snippet ?? "",
    received_at: receivedAt,
    unread: (msg.labelIds ?? []).includes("UNREAD"),
  };
}

interface ListOpts {
  unreadOnly?: boolean;
  todayOnly?: boolean;
  maxResults?: number;
}

/** Lists messages from Primary inbox of a single account. */
async function listPrimaryMessagesForAccount(
  envName: string,
  opts: ListOpts,
): Promise<GmailMessageSummary[]> {
  const max = Math.max(1, Math.min(20, opts.maxResults ?? 10));
  const account = await resolveAccountEmail(envName);
  const qParts = ["category:primary"];
  if (opts.unreadOnly) qParts.push("is:unread");
  if (opts.todayOnly) qParts.push("newer_than:1d");
  const params = new URLSearchParams({
    maxResults: String(max),
    q: qParts.join(" "),
  });
  const list = await gmailGet(envName, `/users/me/messages?${params.toString()}`) as ListResponse;
  const ids = (list.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return [];
  const items = await Promise.all(ids.map((id) => fetchMessageMetadata(envName, account, id)));
  return items;
}

export interface AccountError {
  account: string; // email if resolved, else env var name
  message: string;
}

export interface MultiAccountResult {
  items: GmailMessageSummary[];
  accounts_checked: string[];
  errors: AccountError[];
}

/**
 * Fan-out across all linked Gmail accounts (or a filtered subset).
 *
 * @param accountFilter Optional case-insensitive substring match against the
 *                      resolved email. If provided, only matching accounts are queried.
 *                      If no account matches, returns empty items + an error noting the mismatch.
 */
export async function listPrimaryMessagesAllAccounts(
  opts: ListOpts & { accountFilter?: string },
): Promise<MultiAccountResult> {
  const allKeys = listGmailAccountKeys();
  if (allKeys.length === 0) {
    return {
      items: [],
      accounts_checked: [],
      errors: [{ account: "(none)", message: "No hay cuentas Gmail conectadas." }],
    };
  }

  // Resolve emails up front so we can filter and label errors meaningfully.
  const resolved: Array<{ envName: string; email: string | null; error?: string }> = await Promise.all(
    allKeys.map(async (envName) => {
      try {
        const email = await resolveAccountEmail(envName);
        return { envName, email };
      } catch (e) {
        return { envName, email: null, error: String(e) };
      }
    }),
  );

  const filter = opts.accountFilter?.trim().toLowerCase();
  const targets = filter
    ? resolved.filter((r) => r.email && r.email.toLowerCase().includes(filter))
    : resolved;

  const errors: AccountError[] = [];

  // Capture profile-resolution errors for accounts we *would have* queried.
  for (const r of resolved) {
    if (!r.email && r.error) {
      errors.push({ account: r.envName, message: r.error });
    }
  }

  if (filter && targets.length === 0) {
    return {
      items: [],
      accounts_checked: [],
      errors: [{
        account: filter,
        message: `Ninguna cuenta conectada coincide con "${opts.accountFilter}". Cuentas disponibles: ${
          resolved.filter((r) => r.email).map((r) => r.email).join(", ") || "(ninguna resuelta)"
        }.`,
      }],
    };
  }

  const perAccount = await Promise.all(
    targets.filter((t) => t.email).map(async (t) => {
      try {
        const items = await listPrimaryMessagesForAccount(t.envName, opts);
        return { account: t.email!, items, error: null as string | null };
      } catch (e) {
        return { account: t.email!, items: [] as GmailMessageSummary[], error: String(e) };
      }
    }),
  );

  const accounts_checked: string[] = [];
  let merged: GmailMessageSummary[] = [];
  for (const r of perAccount) {
    accounts_checked.push(r.account);
    if (r.error) {
      errors.push({ account: r.account, message: r.error });
    } else {
      merged = merged.concat(r.items);
    }
  }

  // Newest first across all accounts.
  merged.sort((a, b) => b.received_at.localeCompare(a.received_at));

  // Apply global cap if provided (limit acts as overall ceiling, not per-account).
  if (opts.maxResults && merged.length > opts.maxResults) {
    merged = merged.slice(0, opts.maxResults);
  }

  return { items: merged, accounts_checked, errors };
}

// ─── Backwards-compatible single-account API ───
// Kept so existing tests / callers that only target the primary account still work.
export async function listPrimaryMessages(opts: ListOpts): Promise<GmailMessageSummary[]> {
  const result = await listPrimaryMessagesAllAccounts(opts);
  return result.items;
}

// ─── Full-message detail (opt-in) ───

const BODY_LIMIT = 8000;

interface MimePart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: MimePart[];
}

interface FullMessageResponse {
  id: string;
  threadId: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: MimePart & { headers?: Array<{ name: string; value: string }> };
}

function decodeBase64Url(data: string): string {
  const norm = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  try {
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function findPart(part: MimePart | undefined, mime: string): MimePart | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return part;
  if (part.parts) {
    for (const p of part.parts) {
      const found = findPart(p, mime);
      if (found) return found;
    }
  }
  return null;
}

function extractBody(payload: MimePart | undefined): string {
  if (!payload) return "";
  // Prefer text/plain
  const plain = findPart(payload, "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);
  const html = findPart(payload, "text/html");
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));
  // Fallback: top-level body
  if (payload.body?.data) {
    const raw = decodeBase64Url(payload.body.data);
    return payload.mimeType === "text/html" ? stripHtml(raw) : raw;
  }
  return "";
}

export interface FullMessage {
  id: string;
  account: string;
  from: string;
  to: string;
  subject: string;
  received_at: string;
  body_text: string;
  truncated: boolean;
}

async function getMessageFullForAccount(
  envName: string,
  account: string,
  messageId: string,
): Promise<FullMessage> {
  const msg = await gmailGet(envName, `/users/me/messages/${messageId}?format=full`) as FullMessageResponse;
  const headers = msg.payload?.headers ?? [];
  const h = (name: string) =>
    headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const internal = msg.internalDate ? Number(msg.internalDate) : NaN;
  const receivedAt = Number.isFinite(internal)
    ? new Date(internal).toISOString()
    : (h("Date") || new Date(0).toISOString());
  let body = extractBody(msg.payload);
  const truncated = body.length > BODY_LIMIT;
  if (truncated) body = body.slice(0, BODY_LIMIT) + "\n…[truncado]";
  return {
    id: msg.id,
    account,
    from: h("From"),
    to: h("To"),
    subject: h("Subject") || "(sin asunto)",
    received_at: receivedAt,
    body_text: body,
    truncated,
  };
}

/**
 * Fetches the full body of a single message across all linked Gmail accounts.
 * Tries each candidate account in parallel; first success wins.
 * Throws if no account has the message.
 */
export async function getMessageFullAcrossAccounts(
  messageId: string,
  accountFilter?: string,
): Promise<FullMessage> {
  const allKeys = listGmailAccountKeys();
  if (allKeys.length === 0) {
    throw new Error("No hay cuentas Gmail conectadas.");
  }

  // Resolve emails so we can filter and label.
  const resolved = await Promise.all(
    allKeys.map(async (envName) => {
      try {
        const email = await resolveAccountEmail(envName);
        return { envName, email };
      } catch {
        return { envName, email: null as string | null };
      }
    }),
  );

  const filter = accountFilter?.trim().toLowerCase();
  const targets = resolved.filter((r) =>
    r.email && (!filter || r.email.toLowerCase().includes(filter))
  );

  if (targets.length === 0) {
    throw new Error(
      filter
        ? `Ninguna cuenta conectada coincide con "${accountFilter}".`
        : "No pude resolver ninguna cuenta Gmail conectada.",
    );
  }

  const attempts = await Promise.allSettled(
    targets.map((t) => getMessageFullForAccount(t.envName, t.email!, messageId)),
  );
  for (const a of attempts) {
    if (a.status === "fulfilled") return a.value;
  }
  throw new Error(
    `No encontré ese correo en ninguna cuenta conectada (${
      targets.map((t) => t.email).join(", ")
    }).`,
  );
}

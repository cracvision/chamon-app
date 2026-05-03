// Shared digest builder + sender. Used by send-digest-now (manual) and
// send-digest-cron (scheduled).

export type DigestProfile = {
  id: string;
  full_name?: string | null;
  notification_email?: string | null;
  preferred_language?: string | null;
};

export async function sendDigestForUser(opts: {
  admin: any; // SupabaseClient (service role)
  userId: string;
  fallbackEmail?: string | null;
  profile?: DigestProfile | null;
  resendApiKey: string;
  resendFrom: string;
}): Promise<{ ok: boolean; to: string | null; tasks: number; error?: any; subject: string }> {
  const { admin, userId, resendApiKey, resendFrom } = opts;

  const profile =
    opts.profile ??
    (await admin.from("profiles").select("*").eq("id", userId).maybeSingle()).data;

  const to = profile?.notification_email || opts.fallbackEmail || null;
  const lang = profile?.preferred_language || "es";
  const L =
    lang === "en"
      ? { subject: "Mission Control · Daily digest", focus: "Today · Focus", overdue: "Overdue", none: "Nothing here. Nice." }
      : { subject: "Mission Control · Digest diario", focus: "Hoy · Focus", overdue: "Vencidas", none: "Nada por aquí. Buen trabajo." };

  if (!to) {
    return { ok: false, to: null, tasks: 0, error: "no_recipient", subject: L.subject };
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: focus = [] } = await admin
    .from("tasks")
    .select("id,title,due_date,mission_id")
    .eq("user_id", userId)
    .eq("is_today", true)
    .neq("status", "done")
    .is("deleted_at", null);
  const { data: overdue = [] } = await admin
    .from("tasks")
    .select("id,title,due_date,mission_id")
    .eq("user_id", userId)
    .neq("status", "done")
    .lt("due_date", todayIso)
    .is("deleted_at", null);

  const missionIds = [...new Set([...(focus || []), ...(overdue || [])].map((t: any) => t.mission_id))];
  const { data: missions = [] } = missionIds.length
    ? await admin.from("missions").select("id,title").in("id", missionIds)
    : { data: [] as any[] };
  const mTitle = (id: string) => (missions as any[])?.find((m: any) => m.id === id)?.title || "—";

  const list = (arr: any[]) =>
    arr.length === 0
      ? `<p style="color:#8b95a8;font-family:'IBM Plex Sans',sans-serif;font-size:13px;margin:8px 0 0">${L.none}</p>`
      : `<ul style="margin:8px 0 0;padding:0;list-style:none">${arr
          .map(
            (t) => `
          <li style="padding:8px 10px;margin:4px 0;background:#1c2230;border:1px solid #232a3a;border-radius:6px;font-family:'IBM Plex Sans',sans-serif;font-size:13px;color:#f0ede4">
            ${escapeHtml(t.title)}
            <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:#8b95a8;text-transform:uppercase;letter-spacing:.12em;margin-top:2px">
              ${escapeHtml(mTitle(t.mission_id))}${t.due_date ? ` · ${t.due_date}` : ""}
            </div>
          </li>`,
          )
          .join("")}</ul>`;

  const html = `<div style="background:#0a0d14;padding:24px;font-family:'IBM Plex Sans',sans-serif;color:#f0ede4">
    <div style="max-width:560px;margin:0 auto">
      <p style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:#f59e0b;text-transform:uppercase;letter-spacing:.16em;margin:0">Mission Control · digest</p>
      <h1 style="font-size:22px;font-weight:600;margin:6px 0 18px">${escapeHtml(profile?.full_name || to || "")}</h1>
      <h2 style="font-size:13px;color:#f59e0b;margin:18px 0 0;font-weight:500">${L.focus}</h2>
      ${list(focus || [])}
      <h2 style="font-size:13px;color:#ef4444;margin:18px 0 0;font-weight:500">${L.overdue}</h2>
      ${list(overdue || [])}
    </div>
  </div>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: resendFrom, to: [to], subject: L.subject, html }),
  });
  const sendBody = await resp.json();
  const ok = resp.ok;

  await admin.from("notifications").insert({
    user_id: userId,
    type: "digest",
    email_to: to,
    subject: L.subject,
    status: ok ? "sent" : "failed",
    error: ok ? null : JSON.stringify(sendBody),
  });

  return {
    ok,
    to,
    tasks: (focus?.length || 0) + (overdue?.length || 0),
    error: ok ? undefined : sendBody,
    subject: L.subject,
  };
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

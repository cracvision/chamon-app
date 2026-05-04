// today_summary: Primary-inbox emails received today (PR time).
import { listPrimaryMessages } from "../../_shared/gmail.ts";
import { todayInPR } from "../../_shared/format.ts";

export async function handleTodaySummary(params: { limit?: number }) {
  const limit = Math.max(1, Math.min(20, params.limit ?? 10));
  const messages = await listPrimaryMessages({ todayOnly: true, maxResults: limit });
  const unread = messages.filter((m) => m.unread).length;
  return {
    today: todayInPR(),
    count: messages.length,
    unread_count: unread,
    items: messages,
    message: messages.length === 0
      ? "Hoy no han llegado correos en Primary."
      : `Hoy llegaron ${messages.length} correo(s) en Primary, ${unread} sin leer.`,
  };
}

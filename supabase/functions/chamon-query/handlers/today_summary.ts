// today_summary: Primary-inbox emails received today (PR time) across all linked Gmail accounts.
import { listPrimaryMessagesAllAccounts } from "../../_shared/gmail.ts";
import { todayInPR } from "../../_shared/format.ts";

export async function handleTodaySummary(params: { limit?: number; account?: string }) {
  const limit = Math.max(1, Math.min(20, params.limit ?? 10));
  const { items, accounts_checked, errors } = await listPrimaryMessagesAllAccounts({
    todayOnly: true,
    maxResults: limit,
    accountFilter: params.account,
  });
  const unread = items.filter((m) => m.unread).length;
  const accountSuffix = accounts_checked.length > 1
    ? ` (cuentas: ${accounts_checked.join(", ")})`
    : accounts_checked.length === 1
      ? ` (cuenta: ${accounts_checked[0]})`
      : "";
  return {
    today: todayInPR(),
    count: items.length,
    unread_count: unread,
    items,
    accounts_checked,
    errors,
    message: items.length === 0
      ? `Hoy no han llegado correos en Primary${accountSuffix}.`
      : `Hoy llegaron ${items.length} correo(s) en Primary, ${unread} sin leer${accountSuffix}.`,
  };
}

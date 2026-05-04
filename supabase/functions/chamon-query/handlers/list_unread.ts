// list_unread: most recent unread emails in Primary inbox across all linked Gmail accounts.
import { listPrimaryMessagesAllAccounts } from "../../_shared/gmail.ts";

export async function handleListUnread(params: { limit?: number; account?: string }) {
  const limit = Math.max(1, Math.min(20, params.limit ?? 10));
  const { items, accounts_checked, errors } = await listPrimaryMessagesAllAccounts({
    unreadOnly: true,
    maxResults: limit,
    accountFilter: params.account,
  });
  const accountSuffix = accounts_checked.length > 1
    ? ` (cuentas: ${accounts_checked.join(", ")})`
    : accounts_checked.length === 1
      ? ` (cuenta: ${accounts_checked[0]})`
      : "";
  return {
    count: items.length,
    items,
    accounts_checked,
    errors,
    message: items.length === 0
      ? `No tienes correos sin leer en Primary${accountSuffix}.`
      : `Tienes ${items.length} correo(s) sin leer en Primary${accountSuffix}.`,
  };
}

// list_unread: most recent unread emails in Primary inbox.
import { listPrimaryMessages } from "../../_shared/gmail.ts";

export async function handleListUnread(params: { limit?: number }) {
  const limit = Math.max(1, Math.min(20, params.limit ?? 10));
  const messages = await listPrimaryMessages({ unreadOnly: true, maxResults: limit });
  return {
    count: messages.length,
    items: messages,
    message: messages.length === 0
      ? "No tienes correos sin leer en Primary."
      : `Tienes ${messages.length} correo(s) sin leer en Primary.`,
  };
}

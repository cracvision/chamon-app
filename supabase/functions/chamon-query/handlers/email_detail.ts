// email_detail: Full body of a single Gmail message. Opt-in only —
// Chamón must invoke this only when Carlos explicitly asks for the detail.
import { getMessageFullAcrossAccounts } from "../../_shared/gmail.ts";

export async function handleEmailDetail(params: { message_id: string; account?: string }) {
  const msg = await getMessageFullAcrossAccounts(params.message_id, params.account);
  const dateStr = (() => {
    try {
      return new Date(msg.received_at).toLocaleString("es-PR", {
        timeZone: "America/Puerto_Rico",
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return msg.received_at;
    }
  })();
  return {
    ...msg,
    message: `Correo de ${msg.from || "(remitente desconocido)"} recibido ${dateStr}. Asunto: ${msg.subject}.`,
  };
}

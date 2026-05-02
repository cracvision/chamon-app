// Audit log helper for Chamón write tools.
//
// Writes a row into `public.events`. NEVER throws — audit failures are logged
// to stdout (without user free-text) and return "" so the caller can still
// respond ok:true to the agent. Carlos's UX must not break because of logging.

import type { ChamonClient } from "./client.ts";

export type AuditEntityType = "task" | "mission" | "area" | "contact" | "attachment";

export type AuditAction =
  | "created"
  | "updated"
  | "completed"
  | "due_changed"
  | "status_changed"
  | "deleted"
  | "restored";

export interface AuditEntry {
  user_id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditAction;
  metadata: {
    source: "chamon_agent" | "ui" | "system";
    tool_name?: string;
    conversation_id?: string;
    old_value?: unknown;
    new_value?: unknown;
    [key: string]: unknown;
  };
}

export async function writeAuditEvent(
  supabase: ChamonClient,
  entry: AuditEntry,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("events")
      .insert(entry)
      .select("id")
      .single();
    if (error) {
      console.error("audit_write_failed", {
        code: error.code,
        message: error.message,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        action: entry.action,
        tool_name: entry.metadata.tool_name,
      });
      return "";
    }
    return (data as { id: string }).id;
  } catch (e) {
    console.error("audit_write_exception", {
      err: String(e),
      entity_type: entry.entity_type,
      action: entry.action,
    });
    return "";
  }
}

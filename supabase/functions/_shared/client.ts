// Centralized Supabase client + scoped table wrapper.
// HARD RULE: handlers MUST NOT call `supabase.from(...)` directly.
// All table reads go through `scopedTable(...)` which forces:
//   - .eq("user_id", userId)
//   - .is("deleted_at", null)
//
// Verified post-implementation with: rg "supabase\.from\(" supabase/functions/chamon-query/handlers
// (must return zero matches).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../_shared/database.types.ts";

export type DB = Database;
export type ChamonClient = SupabaseClient<DB>;

// Tables that have BOTH user_id AND deleted_at columns and are safe for scopedTable.
// Tables without deleted_at (events, attachments, task_contacts, notifications) are
// intentionally NOT in this list and not exposed to handlers in Sprint 1.
type ScopedTableName = "areas" | "missions" | "tasks" | "contacts";

export function createServiceClient(): ChamonClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient<DB>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * The ONLY allowed table-access path in handlers.
 * Every SELECT is hard-filtered by `user_id = userId` AND `deleted_at IS NULL`.
 */
export function scopedTable(
  supabase: ChamonClient,
  table: ScopedTableName,
  userId: string,
) {
  return {
    select: (cols = "*") =>
      supabase
        .from(table)
        .select(cols)
        .eq("user_id", userId)
        .is("deleted_at", null),
  };
}

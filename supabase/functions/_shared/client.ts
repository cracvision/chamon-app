// Centralized Supabase client + scoped table wrapper.
//
// HARD RULE: handlers MUST NOT call `supabase.from(...)` directly.
// All table access (read AND write) goes through `scopedTable(...)`, which
// hard-injects `user_id` filters/values.
//
// SECURITY BOUNDARY (read carefully):
// This module authenticates with SUPABASE_SERVICE_ROLE_KEY, which BYPASSES
// all RLS policies. Per-user data isolation is enforced ONLY by `scopedTable`:
//   - select(): forces `.eq("user_id", userId).is("deleted_at", null)`
//   - insert(): forces `user_id = userId` (overwrites any caller-supplied value)
//   - update(): forces `.eq("id", id).eq("user_id", userId)` so cross-user IDs
//                silently no-op instead of mutating someone else's data.
//
// Verify with:
//   rg "supabase\.from\(" supabase/functions/chamon-*/   → must return zero matches
//   in handlers/ subdirectories.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "./database.types.ts";

export type DB = Database;
export type ChamonClient = SupabaseClient<DB>;

// Tables that have BOTH user_id AND deleted_at columns and are safe for scopedTable.
// `events` is excluded here (no deleted_at) — write to it via the audit helper instead.
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
 *   - select(): hard-filtered by user_id + deleted_at IS NULL
 *   - insert(): user_id auto-injected (and overwritten if caller passes it)
 *   - update(): id + user_id filter applied; cross-user IDs no-op silently
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

    insert: (row: Record<string, unknown>) =>
      supabase
        .from(table)
        .insert({ ...row, user_id: userId })
        .select()
        .single(),

    update: (id: string, patch: Record<string, unknown>) => {
      // Strip user_id from patch defensively — never let callers reassign rows.
      const { user_id: _ignore, ...safePatch } = patch as { user_id?: unknown };
      return supabase
        .from(table)
        .update(safePatch)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
    },
  };
}

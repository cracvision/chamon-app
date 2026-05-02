// SEARCH HANDLER EXCEPTION:
// This handler intentionally bypasses scopedTable() because it calls the
// `chamon_search` RPC. That SQL function hardcodes user_id and
// deleted_at IS NULL filters in its body. See migration for proof.
import { ChamonClient } from "../../_shared/client.ts";
import { dueLabelEs, MSG, statusEs } from "../../_shared/format.ts";

export async function handleSearch(
  supabase: ChamonClient,
  userId: string,
  params: { query?: string; limit?: number },
) {
  const q = (params.query ?? "").trim();
  if (q.length < 2) return { count: 0, items: [], message: MSG.empty.search };
  const limit = Math.max(1, Math.min(20, params.limit ?? 10));

  // deno-lint-ignore no-explicit-any
  const { data, error } = await (supabase as any).rpc("chamon_search", {
    _user_id: userId,
    _query: q,
    _limit: limit,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    entity_type: string; id: string; title: string; snippet: string;
    mission_id: string | null; status: string; due_date: string | null;
    similarity: number;
  }>;

  if (rows.length === 0) return { count: 0, items: [], message: MSG.empty.search };

  return {
    count: rows.length,
    query: q,
    items: rows.map((r) => ({
      type: r.entity_type,
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      mission_id: r.mission_id,
      status: statusEs(r.status),
      due: dueLabelEs(r.due_date),
      score: Number(r.similarity.toFixed(3)),
    })),
  };
}

import { ChamonClient, scopedTable } from "../../_shared/client.ts";
import { dueLabelEs, MSG, todayInPR } from "../../_shared/format.ts";

export async function handleOverdue(supabase: ChamonClient, userId: string) {
  const today = todayInPR();
  const { data: tasks, error } = await scopedTable(supabase, "tasks", userId)
    .select("id,title,due_date,status,mission_id")
    .neq("status", "done")
    .lt("due_date", today)
    .order("due_date", { ascending: true });
  if (error) throw error;

  const list = (tasks ?? []) as Array<{
    id: string; title: string; due_date: string | null;
    status: string; mission_id: string;
  }>;

  if (list.length === 0) {
    return { count: 0, items: [], message: MSG.empty.overdue };
  }

  const missionIds = [...new Set(list.map((t) => t.mission_id))];
  const { data: missions } = await scopedTable(supabase, "missions", userId)
    .select("id,title")
    .in("id", missionIds);
  const mTitle = (id: string) =>
    (missions as Array<{ id: string; title: string }> | null)
      ?.find((m) => m.id === id)?.title ?? "—";

  return {
    count: list.length,
    items: list.map((t) => ({
      id: t.id,
      title: t.title,
      mission: mTitle(t.mission_id),
      due: dueLabelEs(t.due_date),
    })),
  };
}

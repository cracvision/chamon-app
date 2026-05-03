import { ChamonClient, scopedTable } from "../../_shared/client.ts";
import { dueLabelEs, MSG, priorityEs, statusEs } from "../../_shared/format.ts";

export async function handleMissionsOverview(supabase: ChamonClient, userId: string) {
  const { data, error } = await scopedTable(supabase, "missions", userId)
    .select("id,title,status,priority,due_date,health,area_id")
    .eq("status", "active")
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const list = (data ?? []) as Array<{
    id: string; title: string; status: string; priority: string;
    due_date: string | null; health: string | null;
    cost_of_inaction_weekly: number; area_id: string | null;
  }>;

  if (list.length === 0) {
    return { count: 0, items: [], message: MSG.empty.missions_overview };
  }

  // Get open task counts for each mission
  const missionIds = list.map((m) => m.id);
  const { data: openTasks } = await scopedTable(supabase, "tasks", userId)
    .select("mission_id,status")
    .in("mission_id", missionIds)
    .neq("status", "done");
  const counts = new Map<string, number>();
  for (const t of (openTasks ?? []) as Array<{ mission_id: string }>) {
    counts.set(t.mission_id, (counts.get(t.mission_id) ?? 0) + 1);
  }

  return {
    count: list.length,
    items: list.map((m) => ({
      id: m.id,
      title: m.title,
      status: statusEs(m.status),
      priority: priorityEs(m.priority),
      due: dueLabelEs(m.due_date),
      health: m.health ?? "ok",
      coi_weekly: Number(m.cost_of_inaction_weekly),
      open_tasks: counts.get(m.id) ?? 0,
    })),
  };
}

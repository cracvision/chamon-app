import { ChamonClient, scopedTable } from "../client.ts";
import { dueLabelEs, MSG, todayInPR } from "../format.ts";

// "Needs attention" = critical missions OR missions with overdue tasks OR
// missions due in <= 3 days OR high COI (>50/week).
export async function handleWhatNeedsAttention(supabase: ChamonClient, userId: string) {
  const today = todayInPR();
  const horizon = new Date(today + "T00:00:00");
  horizon.setDate(horizon.getDate() + 3);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data: missions, error } = await scopedTable(supabase, "missions", userId)
    .select("id,title,priority,due_date,health,cost_of_inaction_weekly,status")
    .eq("status", "active");
  if (error) throw error;

  const mList = (missions ?? []) as Array<{
    id: string; title: string; priority: string; due_date: string | null;
    health: string | null; cost_of_inaction_weekly: number; status: string;
  }>;

  if (mList.length === 0) {
    return { count: 0, items: [], message: MSG.empty.what_needs_attention };
  }

  const ids = mList.map((m) => m.id);
  const { data: overdueTasks } = await scopedTable(supabase, "tasks", userId)
    .select("mission_id,due_date,status,title")
    .in("mission_id", ids)
    .neq("status", "done")
    .lt("due_date", today);
  const overdueByMission = new Map<string, number>();
  for (const t of (overdueTasks ?? []) as Array<{ mission_id: string }>) {
    overdueByMission.set(t.mission_id, (overdueByMission.get(t.mission_id) ?? 0) + 1);
  }

  const flagged = mList
    .map((m) => {
      const reasons: string[] = [];
      if (m.health === "crit") reasons.push("salud crítica");
      if (m.due_date && m.due_date < today) reasons.push(`misión vencida (${dueLabelEs(m.due_date)})`);
      else if (m.due_date && m.due_date <= horizonIso) reasons.push(`misión ${dueLabelEs(m.due_date)}`);
      const od = overdueByMission.get(m.id) ?? 0;
      if (od > 0) reasons.push(`${od} tarea${od === 1 ? "" : "s"} vencida${od === 1 ? "" : "s"}`);
      if (Number(m.cost_of_inaction_weekly) > 50) {
        reasons.push(`COI alto $${Math.round(Number(m.cost_of_inaction_weekly))}/sem`);
      }
      return { mission: m, reasons };
    })
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length);

  if (flagged.length === 0) {
    return { count: 0, items: [], message: MSG.empty.what_needs_attention };
  }

  return {
    count: flagged.length,
    items: flagged.map(({ mission, reasons }) => ({
      id: mission.id,
      title: mission.title,
      priority: mission.priority,
      health: mission.health ?? "ok",
      due: dueLabelEs(mission.due_date),
      coi_weekly: Number(mission.cost_of_inaction_weekly),
      reasons,
    })),
  };
}

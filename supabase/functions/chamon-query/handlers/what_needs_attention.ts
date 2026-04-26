import { ChamonClient, scopedTable } from "../client.ts";
import { dueLabelEs, MSG, todayInPR } from "../format.ts";

// "Needs attention" = critical missions OR missions with overdue tasks OR
// missions due in <= 3 days OR high COI (>50/week).
//
// urgency_score is a 0-100 weighted composite:
//   crit health           → +40
//   mission overdue       → +30 (clamped)
//   mission due ≤3d       → +15
//   per overdue task      → +8 (cap +24)
//   COI > 50/week         → +10
//   COI > 200/week        → +20 (replaces above)
//   high priority         → +10
export async function handleWhatNeedsAttention(
  supabase: ChamonClient,
  userId: string,
  params: { limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(50, params.limit ?? 50));

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
      let score = 0;

      if (m.health === "crit") {
        reasons.push("salud crítica");
        score += 40;
      }
      if (m.due_date && m.due_date < today) {
        reasons.push(`misión vencida (${dueLabelEs(m.due_date)})`);
        score += 30;
      } else if (m.due_date && m.due_date <= horizonIso) {
        reasons.push(`misión ${dueLabelEs(m.due_date)}`);
        score += 15;
      }

      const od = overdueByMission.get(m.id) ?? 0;
      if (od > 0) {
        reasons.push(`${od} tarea${od === 1 ? "" : "s"} vencida${od === 1 ? "" : "s"}`);
        score += Math.min(24, od * 8);
      }

      const coi = Number(m.cost_of_inaction_weekly);
      if (coi > 200) {
        reasons.push(`COI alto $${Math.round(coi)}/sem`);
        score += 20;
      } else if (coi > 50) {
        reasons.push(`COI alto $${Math.round(coi)}/sem`);
        score += 10;
      }

      if (m.priority === "high") {
        reasons.push("prioridad alta");
        score += 10;
      }

      return { mission: m, reasons, score: Math.min(100, score) };
    })
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => b.score - a.score || b.reasons.length - a.reasons.length)
    .slice(0, limit);

  if (flagged.length === 0) {
    return { count: 0, items: [], message: MSG.empty.what_needs_attention };
  }

  return {
    count: flagged.length,
    limit,
    items: flagged.map(({ mission, reasons, score }) => ({
      id: mission.id,
      title: mission.title,
      priority: mission.priority,
      health: mission.health ?? "ok",
      due: dueLabelEs(mission.due_date),
      coi_weekly: Number(mission.cost_of_inaction_weekly),
      urgency_score: score,
      reasons,
    })),
  };
}

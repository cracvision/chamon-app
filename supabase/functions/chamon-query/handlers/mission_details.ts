import { ChamonClient, scopedTable } from "../../_shared/client.ts";
import { dueLabelEs, MSG, priorityEs, statusEs } from "../../_shared/format.ts";

export async function handleMissionDetails(
  supabase: ChamonClient,
  userId: string,
  params: { mission_id?: string; mission_title?: string },
) {
  let missionId = params.mission_id;

  // Resolve by title if no id provided
  if (!missionId && params.mission_title) {
    const { data: matches } = await scopedTable(supabase, "missions", userId)
      .select("id,title")
      .ilike("title", `%${params.mission_title}%`)
      .limit(1);
    const m = (matches as Array<{ id: string }> | null)?.[0];
    if (!m) return { found: false, message: MSG.notFound };
    missionId = m.id;
  }

  if (!missionId) return { found: false, message: MSG.notFound };

  const { data: missionRows, error } = await scopedTable(supabase, "missions", userId)
    .select("id,title,description,status,priority,due_date,health,cost_of_inaction_weekly,reward_text,area_id")
    .eq("id", missionId);
  if (error) throw error;

  const mission = (missionRows as Array<{
    id: string; title: string; description: string | null; status: string;
    priority: string; due_date: string | null; health: string | null;
    cost_of_inaction_weekly: number; reward_text: string | null; area_id: string | null;
  }> | null)?.[0];
  if (!mission) return { found: false, message: MSG.notFound };

  const { data: tasksData } = await scopedTable(supabase, "tasks", userId)
    .select("id,title,status,due_date,is_today,friction_level,effort_minutes")
    .eq("mission_id", missionId)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false });
  const tasks = (tasksData ?? []) as Array<{
    id: string; title: string; status: string; due_date: string | null;
    is_today: boolean; friction_level: number; effort_minutes: number | null;
  }>;

  return {
    found: true,
    mission: {
      id: mission.id,
      title: mission.title,
      description: mission.description,
      status: statusEs(mission.status),
      priority: priorityEs(mission.priority),
      due: dueLabelEs(mission.due_date),
      health: mission.health ?? "ok",
      coi_weekly: Number(mission.cost_of_inaction_weekly),
      reward: mission.reward_text,
    },
    tasks: {
      total: tasks.length,
      open: tasks.filter((t) => t.status !== "done").length,
      done: tasks.filter((t) => t.status === "done").length,
      items: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: statusEs(t.status),
        due: dueLabelEs(t.due_date),
        is_today: t.is_today,
        effort_min: t.effort_minutes,
        friction: t.friction_level,
      })),
    },
  };
}

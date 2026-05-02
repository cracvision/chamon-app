import { ChamonClient, scopedTable } from "../../_shared/client.ts";
import { dueLabelEs, MSG, todayInPR } from "../../_shared/format.ts";

export async function handleTodayFocus(supabase: ChamonClient, userId: string) {
  const today = todayInPR();
  const { data: tasks, error } = await scopedTable(supabase, "tasks", userId)
    .select("id,title,due_date,status,mission_id,effort_minutes,friction_level")
    .eq("is_today", true)
    .neq("status", "done")
    .order("friction_level", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const list = (tasks ?? []) as Array<{
    id: string; title: string; due_date: string | null; status: string;
    mission_id: string; effort_minutes: number | null; friction_level: number;
  }>;

  if (list.length === 0) {
    return { today: today, count: 0, items: [], message: MSG.empty.today_focus };
  }

  const missionIds = [...new Set(list.map((t) => t.mission_id))];
  const { data: missions } = await scopedTable(supabase, "missions", userId)
    .select("id,title")
    .in("id", missionIds);
  const mTitle = (id: string) =>
    (missions as Array<{ id: string; title: string }> | null)
      ?.find((m) => m.id === id)?.title ?? "—";

  return {
    today,
    count: list.length,
    items: list.map((t) => ({
      id: t.id,
      title: t.title,
      mission: mTitle(t.mission_id),
      due: dueLabelEs(t.due_date),
      effort_min: t.effort_minutes,
      friction: t.friction_level,
    })),
  };
}

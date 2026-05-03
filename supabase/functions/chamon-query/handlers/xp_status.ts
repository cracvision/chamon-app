// xp_status: gamification snapshot for the voice agent.
// NOTE: user_stats/achievements/user_achievements/xp_events are not in
// scopedTable's allowed list (no deleted_at), so we use raw .from() with
// explicit user_id filters. Read-only, no cross-user write risk.
import { ChamonClient } from "../../_shared/client.ts";

const LEVEL_THRESHOLDS = [0, 501, 1501, 4001, 10001];

export async function handleXpStatus(supabase: ChamonClient, userId: string) {
  const [statsRes, catalogRes, unlockedRes, eventsRes] = await Promise.all([
    supabase.from("user_stats").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("achievements").select("*").order("sort_order"),
    supabase.from("user_achievements").select("*").eq("user_id", userId),
    supabase.from("xp_events").select("delta,created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const stats = (statsRes.data ?? {
    total_xp: 0, current_level: 1, level_name: "Recluta",
    current_streak: 0, longest_streak: 0,
    tasks_completed_total: 0, missions_completed_total: 0,
  }) as {
    total_xp: number; current_level: number; level_name: string;
    current_streak: number; longest_streak: number;
    tasks_completed_total: number; missions_completed_total: number;
  };

  const catalog = (catalogRes.data ?? []) as Array<{
    id: string; name: string; description: string; icon: string;
    criteria_type: string; criteria_value: number; sort_order: number;
  }>;
  const unlocked = (unlockedRes.data ?? []) as Array<{
    achievement_id: string; unlocked_at: string | null; progress: number;
  }>;
  const events = (eventsRes.data ?? []) as Array<{ delta: number; created_at: string }>;

  const lvl = stats.current_level;
  const xp = stats.total_xp;
  const cur = LEVEL_THRESHOLDS[lvl - 1] ?? 0;
  const nxt = LEVEL_THRESHOLDS[lvl] ?? cur;
  const xpToNext = lvl >= 5 ? 0 : Math.max(0, nxt - xp);
  const pct = lvl >= 5 ? 100 : Math.min(100, Math.round(((xp - cur) / (nxt - cur)) * 100));

  const recentUnlocked = unlocked
    .filter(u => u.unlocked_at)
    .sort((a, b) => (b.unlocked_at! > a.unlocked_at! ? 1 : -1))
    .slice(0, 3)
    .map(u => {
      const meta = catalog.find(c => c.id === u.achievement_id);
      return meta ? { name: meta.name, icon: meta.icon, unlocked_at: u.unlocked_at } : null;
    })
    .filter(Boolean);

  const closest = catalog
    .map(c => {
      const u = unlocked.find(x => x.achievement_id === c.id);
      if (u?.unlocked_at) return null;
      const progress = u?.progress ?? 0;
      const pctP = Math.min(100, Math.round((progress / c.criteria_value) * 100));
      return { id: c.id, name: c.name, icon: c.icon, progress, target: c.criteria_value, pct: pctP };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  const todayIso = new Date().toISOString().slice(0, 10);
  const xpToday = events.filter(e => e.created_at.slice(0, 10) === todayIso)
    .reduce((s, e) => s + e.delta, 0);
  const xp7d = events.reduce((s, e) => s + e.delta, 0);

  return {
    level: {
      number: lvl,
      name: stats.level_name,
      xp_total: xp,
      xp_to_next: xpToNext,
      progress_pct: pct,
      is_max: lvl >= 5,
    },
    streak: {
      current_days: stats.current_streak,
      longest_days: stats.longest_streak,
    },
    totals: {
      tasks_completed: stats.tasks_completed_total,
      missions_completed: stats.missions_completed_total,
    },
    trophies: {
      unlocked_count: unlocked.filter(u => u.unlocked_at).length,
      total_count: catalog.length,
      recent_unlocked: recentUnlocked,
      closest_to_unlock: closest,
    },
    xp_recent: {
      today: xpToday,
      last_7_days: xp7d,
    },
  };
}
